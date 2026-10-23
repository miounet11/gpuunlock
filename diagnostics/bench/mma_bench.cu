// SPDX-License-Identifier: GPL-2.0-only
/*
 * mma_bench: measure the instruction issue rate of the units the SM
 * speed-select fuses control. Used for the RTX 4090 register report.
 *
 * Modes (all register-resident, no memory traffic in the loop):
 *   f16/f16   mma.m16n16k16, half inputs, half accumulator
 *   f16/f32   mma.m16n16k16, half inputs, float accumulator
 *   bf16/f32  mma.m16n16k16, bfloat16 inputs, float accumulator
 *   s8/s32    mma.m16n16k16, int8 inputs, int32 accumulator
 *   dp4a      dp4a.s32.s32, the integer dot-product instruction
 *   ffma      fma.rn.f32, the scalar FP32 unit
 *
 * Each mode keeps 8 independent accumulator chains in flight per warp so the
 * tensor-core latency is hidden, and the result is forced through a comparison
 * that can never be true so the compiler cannot delete the loop.
 *
 * FLOPs per instruction are counted as 2 * (elements multiplied) per warp for
 * the mma shapes, and per lane (x32) for dp4a (4 int8 MACs, 8 ops) and for one
 * f32 FMA (2 ops).
 *
 * Build and run (sm_89 for AD102, sm_86 for GA102):
 *   nvcc -O3 -arch=sm_89 -o /tmp/mma_bench mma_bench.cu
 *   /tmp/mma_bench [iters] [reps]
 *
 * Notes:
 *  - Reads no registers and writes nothing to the GPU: it only issues compute.
 *  - Record clocks and power alongside each invocation: sustained tensor load
 *    can change clocks. Each mode is measured `reps` times and the best run is
 *    reported. Preserve launch settings when comparing before and after.
 */
#include <cstdio>
#include <cstdlib>
#include <cuda_fp16.h>
#include <cuda_bf16.h>
#include <mma.h>

using namespace nvcuda;

static void cuda_check(cudaError_t code, const char *where)
{
	if (code != cudaSuccess) {
		std::fprintf(stderr, "%s: %s\n", where, cudaGetErrorString(code));
		std::exit(2);
	}
}

#define WARPS_PER_BLOCK 8
#define BLOCKS 1056            /* Fixed grid retained for comparable measurements. */
#define CHAINS 8               /* independent accumulator chains per warp (mma) */
#define SCHAINS 32             /* the scalar units need more: 8 chains is latency-bound */
#define WMMA_FLOPS 8192.0      /* 16*16*16*2 */
#define DP4A_FLOPS 8.0
#define FFMA_FLOPS 2.0
#define LANES 32               /* the scalar asm below is per lane, mma is per warp */

template <typename In, typename Acc>
__global__ void bench_mma(unsigned long long iters, float *sink)
{
	wmma::fragment<wmma::matrix_a, 16, 16, 16, In, wmma::row_major> a;
	wmma::fragment<wmma::matrix_b, 16, 16, 16, In, wmma::col_major> b;
	wmma::fragment<wmma::accumulator, 16, 16, 16, Acc> c[CHAINS];
	__shared__ In sm[32 * 16];
	Acc carry = (Acc)0;
	int j, e;

	for (int i = threadIdx.x; i < 32 * 16; i += blockDim.x)
		sm[i] = (In)(1 + (i & 3));
	__syncthreads();
	wmma::load_matrix_sync(a, sm, 16);
	wmma::load_matrix_sync(b, sm, 16);
	for (j = 0; j < CHAINS; j++)
		wmma::fill_fragment(c[j], (Acc)0);

	for (unsigned long long i = 0; i < iters; i++) {
#pragma unroll
		for (j = 0; j < CHAINS; j++)
			wmma::mma_sync(c[j], a, b, c[j]);
	}
	for (j = 0; j < CHAINS; j++)
		for (e = 0; e < c[j].num_elements; e++)
			carry += c[j].x[e];
	if (carry == (Acc)0x7fffffff)
		sink[threadIdx.x] = 1.0f;
}

__global__ void bench_dp4a(unsigned long long iters, float *sink)
{
	int a = threadIdx.x * 0x01010101 + 0x03020100;
	int b = threadIdx.x * 0x00010001 + 0x04030201;
	int c[SCHAINS];
	int carry = 0;
	int j;

#pragma unroll
	for (j = 0; j < SCHAINS; j++)
		c[j] = threadIdx.x + j;
	for (unsigned long long i = 0; i < iters; i++) {
#pragma unroll
		for (j = 0; j < SCHAINS; j++)
			asm volatile("dp4a.s32.s32 %0, %1, %2, %0;"
				     : "+r"(c[j]) : "r"(a), "r"(b));
	}
#pragma unroll
	for (j = 0; j < SCHAINS; j++)
		carry += c[j];
	if (carry == 0x7fffffff)
		sink[threadIdx.x] = 1.0f;
}

__global__ void bench_ffma(unsigned long long iters, float *sink)
{
	float a = 1.0f + threadIdx.x * 1e-7f;
	float b = 1e-7f;
	float c[SCHAINS];
	float carry = 0.0f;
	int j;

#pragma unroll
	for (j = 0; j < SCHAINS; j++)
		c[j] = threadIdx.x * 1e-9f + j;
	for (unsigned long long i = 0; i < iters; i++) {
#pragma unroll
		for (j = 0; j < SCHAINS; j++)
			asm volatile("fma.rn.f32 %0, %1, %2, %0;"
				     : "+f"(c[j]) : "f"(a), "f"(b));
	}
#pragma unroll
	for (j = 0; j < SCHAINS; j++)
		carry += c[j];
	if (carry == 1234.5678f)
		sink[threadIdx.x] = 1.0f;
}

static float time_ms(void (*launch)(unsigned long long, float *), unsigned long long iters,
		     float *sink)
{
	cudaEvent_t start, stop;
	float ms = 0.0f;

	cuda_check(cudaEventCreate(&start), "create start event");
	cuda_check(cudaEventCreate(&stop), "create stop event");
	launch(iters, sink);                    /* warm up clocks and icache */
	cuda_check(cudaPeekAtLastError(), "warm-up launch");
	cuda_check(cudaDeviceSynchronize(), "warm-up synchronize");
	cuda_check(cudaEventRecord(start), "record start");
	launch(iters, sink);
	cuda_check(cudaPeekAtLastError(), "timed launch");
	cuda_check(cudaEventRecord(stop), "record stop");
	cuda_check(cudaEventSynchronize(stop), "timed synchronize");
	cuda_check(cudaEventElapsedTime(&ms, start, stop), "elapsed time");
	cuda_check(cudaEventDestroy(start), "destroy start event");
	cuda_check(cudaEventDestroy(stop), "destroy stop event");
	return ms;
}

#define LAUNCH(name, In, Acc) \
	static void name(unsigned long long iters, float *sink) \
	{ bench_mma<In, Acc><<<BLOCKS, WARPS_PER_BLOCK * 32>>>(iters, sink); }

LAUNCH(launch_mma_f16_f16, __half, __half)
LAUNCH(launch_mma_f16_f32, __half, float)
LAUNCH(launch_mma_bf16_f32, __nv_bfloat16, float)
LAUNCH(launch_mma_s8_s32, signed char, int)

static void launch_dp4a(unsigned long long iters, float *sink)
{
	bench_dp4a<<<BLOCKS, WARPS_PER_BLOCK * 32>>>(iters, sink);
}

static void launch_ffma(unsigned long long iters, float *sink)
{
	bench_ffma<<<BLOCKS, WARPS_PER_BLOCK * 32>>>(iters, sink);
}

struct mode {
	const char *name;
	void (*launch)(unsigned long long, float *);
	double flops_per_warp_iter;
};

int main(int argc, char **argv)
{
	unsigned long long iters = argc > 1 ? strtoull(argv[1], NULL, 0) : 20000;
	int reps = argc > 2 ? atoi(argv[2]) : 3;
	struct mode modes[] = {
		{ "f16/f16 ", launch_mma_f16_f16, WMMA_FLOPS * CHAINS },
		{ "f16/f32 ", launch_mma_f16_f32, WMMA_FLOPS * CHAINS },
		{ "bf16/f32", launch_mma_bf16_f32, WMMA_FLOPS * CHAINS },
		{ "s8/s32  ", launch_mma_s8_s32, WMMA_FLOPS * CHAINS },
		{ "dp4a    ", launch_dp4a, DP4A_FLOPS * SCHAINS * LANES },
		{ "ffma    ", launch_ffma, FFMA_FLOPS * SCHAINS * LANES },
	};
	double warps = (double)BLOCKS * WARPS_PER_BLOCK;
	float *sink;
	cudaDeviceProp prop;
	unsigned int i;
	int r;

	if (cudaGetDeviceProperties(&prop, 0) != cudaSuccess) {
		fprintf(stderr, "no CUDA device\n");
		return 1;
	}
	printf("# %s, %d SMs, sm_%d%d, iters=%llu reps=%d\n", prop.name, prop.multiProcessorCount,
	       prop.major, prop.minor, iters, reps);
	cuda_check(cudaMalloc(&sink, 1024 * sizeof(float)), "allocate sink");
	printf("%-9s %10s %10s\n", "mode", "best TF/s", "all runs");
	for (i = 0; i < sizeof(modes) / sizeof(modes[0]); i++) {
		double best = 0.0, tflops;
		char runs[128] = "";
		size_t used = 0;

		for (r = 0; r < reps; r++) {
			float ms = time_ms(modes[i].launch, iters, sink);
			if (ms <= 0.0f)
				continue;
			tflops = warps * (double)iters * modes[i].flops_per_warp_iter / (ms * 1e9);
			if (tflops > best)
				best = tflops;
			used += snprintf(runs + used, sizeof(runs) - used, "%s%.1f",
					 used ? "/" : "", tflops);
		}
		printf("%-9s %10.1f %10s\n", modes[i].name, best, runs);
	}
	cuda_check(cudaFree(sink), "free sink");
	return 0;
}
