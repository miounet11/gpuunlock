// SPDX-License-Identifier: GPL-2.0-only
// Register-resident SM89 MMA issue-rate probe. Every input is exactly one.
// Each warp executes eight independent accumulator chains per loop iteration.
#include <stdint.h>

#define CHAINS 8

extern "C" __global__ void bench_f16_f32(unsigned long long iters, float *sink) {
    const unsigned a0=0x3c003c00u,a1=a0,a2=a0,a3=a0,b0=a0,b1=a0;
    float c0[CHAINS],c1[CHAINS],c2[CHAINS],c3[CHAINS];
#pragma unroll
    for(int j=0;j<CHAINS;++j) c0[j]=c1[j]=c2[j]=c3[j]=0.0f;
    for(unsigned long long i=0;i<iters;++i) {
#pragma unroll
        for(int j=0;j<CHAINS;++j)
            asm volatile("mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32 "
                         "{%0,%1,%2,%3}, {%4,%5,%6,%7}, {%8,%9}, {%0,%1,%2,%3};"
                         : "+f"(c0[j]),"+f"(c1[j]),"+f"(c2[j]),"+f"(c3[j])
                         : "r"(a0),"r"(a1),"r"(a2),"r"(a3),"r"(b0),"r"(b1));
    }
    float sum=0.0f;
#pragma unroll
    for(int j=0;j<CHAINS;++j) sum+=c0[j]+c1[j]+c2[j]+c3[j];
    sink[blockIdx.x*blockDim.x+threadIdx.x]=sum;
}

extern "C" __global__ void bench_tf32(unsigned long long iters, float *sink) {
    const unsigned a0=0x3f800000u,a1=a0,a2=a0,a3=a0,b0=a0,b1=a0;
    float c0[CHAINS],c1[CHAINS],c2[CHAINS],c3[CHAINS];
#pragma unroll
    for(int j=0;j<CHAINS;++j) c0[j]=c1[j]=c2[j]=c3[j]=0.0f;
    for(unsigned long long i=0;i<iters;++i) {
#pragma unroll
        for(int j=0;j<CHAINS;++j)
            asm volatile("mma.sync.aligned.m16n8k8.row.col.f32.tf32.tf32.f32 "
                         "{%0,%1,%2,%3}, {%4,%5,%6,%7}, {%8,%9}, {%0,%1,%2,%3};"
                         : "+f"(c0[j]),"+f"(c1[j]),"+f"(c2[j]),"+f"(c3[j])
                         : "r"(a0),"r"(a1),"r"(a2),"r"(a3),"r"(b0),"r"(b1));
    }
    float sum=0.0f;
#pragma unroll
    for(int j=0;j<CHAINS;++j) sum+=c0[j]+c1[j]+c2[j]+c3[j];
    sink[blockIdx.x*blockDim.x+threadIdx.x]=sum;
}

extern "C" __global__ void bench_u4(unsigned long long iters, int *sink) {
    const unsigned a0=0x11111111u,a1=a0,a2=a0,a3=a0,b0=a0,b1=a0;
    int c0[CHAINS],c1[CHAINS],c2[CHAINS],c3[CHAINS];
#pragma unroll
    for(int j=0;j<CHAINS;++j) c0[j]=c1[j]=c2[j]=c3[j]=0;
    for(unsigned long long i=0;i<iters;++i) {
#pragma unroll
        for(int j=0;j<CHAINS;++j)
            asm volatile("mma.sync.aligned.m16n8k64.row.col.s32.u4.u4.s32 "
                         "{%0,%1,%2,%3}, {%4,%5,%6,%7}, {%8,%9}, {%0,%1,%2,%3};"
                         : "+r"(c0[j]),"+r"(c1[j]),"+r"(c2[j]),"+r"(c3[j])
                         : "r"(a0),"r"(a1),"r"(a2),"r"(a3),"r"(b0),"r"(b1));
    }
    int sum=0;
#pragma unroll
    for(int j=0;j<CHAINS;++j) sum+=c0[j]+c1[j]+c2[j]+c3[j];
    sink[blockIdx.x*blockDim.x+threadIdx.x]=sum;
}
