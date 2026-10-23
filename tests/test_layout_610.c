// SPDX-License-Identifier: GPL-2.0-only
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "layout_610.h"

int main(void)
{
	struct gpu_unlock_layout_in in = {
		.usable_fb = 24ull << 30,
		.vga_base = (24ull << 30) - (1024ull * 1024),
		.frts_size = 1024ull * 1024,
		.boot_size = 4096,
		.image_size = 64ull * 1024,
		.nonwpr_size = 1,
		.heap_request = 1024ull * 1024,
	};
	struct gpu_unlock_layout_out out;

	assert(gpu_unlock_layout(NULL, &out) == -EINVAL);
	assert(!gpu_unlock_layout(&in, &out));
	assert(out.wpr_end > out.frts_offset && out.frts_offset > out.boot_offset);
	assert(out.boot_offset > out.gsp_offset && out.gsp_offset > out.heap_offset);
	assert(out.heap_offset > out.wpr_start && out.wpr_start > out.nonwpr_start);
	assert((out.wpr_end & ((128ull * 1024) - 1)) == 0);
	assert(out.heap_size >= in.heap_request);
	/* Reservations that do not fit below the VGA workspace fail cleanly. */
	in.frts_size = in.vga_base;
	assert(gpu_unlock_layout(&in, &out) == -EINVAL ||
	       gpu_unlock_layout(&in, &out) == -ERANGE);
	puts("layout checks passed");
	return 0;
}
