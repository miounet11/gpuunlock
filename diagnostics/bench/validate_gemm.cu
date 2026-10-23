// SPDX-License-Identifier: GPL-2.0-only
/*
 * Deterministic numerical check for Ada FP16/BF16 tensor GEMM with FP32
 * accumulation. Build with CUDA 12.8 and run before and after the unlock on
 * the same exact GPU. This is a correctness check, not a throughput benchmark.
 */
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <cuda_bf16.h>
#include <cublas_v2.h>

static void cuda_check(cudaError_t code, const char *where)
{
	if (code != cudaSuccess) {
		std::fprintf(stderr, "%s: %s\n", where, cudaGetErrorString(code));
		std::exit(2);
	}
}

static void blas_check(cublasStatus_t code, const char *where)
{
	if (code != CUBLAS_STATUS_SUCCESS) {
		std::fprintf(stderr, "%s: cuBLAS status %d\n", where, (int)code);
		std::exit(2);
	}
}

template <typename T>
static T convert(float x);
template <> __half convert<__half>(float x) { return __float2half_rn(x); }
template <> __nv_bfloat16 convert<__nv_bfloat16>(float x)
{
	return __float2bfloat16_rn(x);
}

template <typename T>
static bool check_mode(cublasHandle_t handle, const char *name,
			    cudaDataType input_type)
{
	constexpr int n = 256;
	constexpr size_t count = (size_t)n * n;
	std::vector<T> a(count), b(count);
	std::vector<float> reference(count, 0.0f), result(count);
	T *device_a = nullptr, *device_b = nullptr;
	float *device_c = nullptr;
	const float alpha = 1.0f, beta = 0.0f;
	int failures = 0;
	float max_abs = 0.0f;

	/* Values are exact in half, bfloat16 and float, including their products. */
	for (int col = 0; col < n; ++col)
		for (int row = 0; row < n; ++row) {
			a[row + col * n] = convert<T>(((row * 17 + col * 11) % 17 - 8) / 8.0f);
			b[row + col * n] = convert<T>(((row * 7 + col * 13) % 19 - 9) / 8.0f);
		}
	for (int col = 0; col < n; ++col)
		for (int k = 0; k < n; ++k)
			for (int row = 0; row < n; ++row)
				reference[row + col * n] +=
					(float)a[row + k * n] * (float)b[k + col * n];

	cuda_check(cudaMalloc(&device_a, count * sizeof(T)), "cudaMalloc(A)");
	cuda_check(cudaMalloc(&device_b, count * sizeof(T)), "cudaMalloc(B)");
	cuda_check(cudaMalloc(&device_c, count * sizeof(float)), "cudaMalloc(C)");
	cuda_check(cudaMemcpy(device_a, a.data(), count * sizeof(T), cudaMemcpyHostToDevice), "copy A");
	cuda_check(cudaMemcpy(device_b, b.data(), count * sizeof(T), cudaMemcpyHostToDevice), "copy B");
	blas_check(cublasGemmEx(handle, CUBLAS_OP_N, CUBLAS_OP_N, n, n, n,
				&alpha, device_a, input_type, n, device_b, input_type, n,
				&beta, device_c, CUDA_R_32F, n,
				CUBLAS_COMPUTE_32F, CUBLAS_GEMM_DEFAULT_TENSOR_OP), "cublasGemmEx");
	cuda_check(cudaDeviceSynchronize(), "GEMM synchronize");
	cuda_check(cudaMemcpy(result.data(), device_c, count * sizeof(float),
			      cudaMemcpyDeviceToHost), "copy C");
	for (size_t i = 0; i < count; ++i) {
		float diff = std::fabs(result[i] - reference[i]);
		if (!std::isfinite(result[i]) || diff > 1e-3f) {
			if (++failures <= 4)
				std::fprintf(stderr, "%s mismatch [%zu]: GPU %.8g, CPU %.8g\n",
					     name, i, result[i], reference[i]);
		}
		if (diff > max_abs)
			max_abs = diff;
	}
	std::printf("%s: %zu cells, failures=%d, max_abs=%.8g\n",
		    name, count, failures, max_abs);
	cuda_check(cudaFree(device_a), "free A");
	cuda_check(cudaFree(device_b), "free B");
	cuda_check(cudaFree(device_c), "free C");
	return failures == 0;
}

int main()
{
	cublasHandle_t handle;
	cudaDeviceProp prop;
	char bus_id[32];
	cuda_check(cudaGetDeviceProperties(&prop, 0), "device properties");
	cuda_check(cudaDeviceGetPCIBusId(bus_id, sizeof(bus_id), 0), "PCI bus ID");
	std::printf("GPU: %s, sm_%d%d, PCI %s\n", prop.name, prop.major,
		    prop.minor, bus_id);
	if (prop.major != 8 || prop.minor != 9) {
		std::fprintf(stderr, "Expected an Ada sm_89 device\n");
		return 3;
	}
	blas_check(cublasCreate(&handle), "cublasCreate");
	bool pass_half = check_mode<__half>(handle, "FP16/FP32", CUDA_R_16F);
	bool pass_bf16 = check_mode<__nv_bfloat16>(handle, "BF16/FP32", CUDA_R_16BF);
	blas_check(cublasDestroy(handle), "cublasDestroy");
	return pass_half && pass_bf16 ? 0 : 1;
}
