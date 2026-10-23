// SPDX-License-Identifier: GPL-2.0-only
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "layout_610.h"
#include "prep_610.h"

static void put16(unsigned char *p, unsigned int v)
{
	p[0] = v & 0xff;
	p[1] = (v >> 8) & 0xff;
}

static void put32(unsigned char *p, unsigned int v)
{
	p[0] = v & 0xff;
	p[1] = (v >> 8) & 0xff;
	p[2] = (v >> 16) & 0xff;
	p[3] = (v >> 24) & 0xff;
}

static void put64(unsigned char *p, unsigned long long v)
{
	unsigned int i;

	for (i = 0; i < 8; i++)
		p[i] = (unsigned char)(v >> (8 * i));
}

static void check_shared_gsp_sections(const char *assets)
{
	char path[4096];
	struct gpu_unlock_span image, ga, ad;
	unsigned char *data;
	FILE *file;
	long length;
	int written;

	written = snprintf(path, sizeof(path), "%s/gsp_ga10x.bin", assets);
	assert(written > 0 && (size_t)written < sizeof(path));
	file = fopen(path, "rb");
	assert(file && !fseek(file, 0, SEEK_END));
	length = ftell(file);
	assert(length > 0 && length < 128L * 1024 * 1024);
	assert(!fseek(file, 0, SEEK_SET));
	data = malloc((size_t)length);
	assert(data && fread(data, 1, (size_t)length, file) == (size_t)length);
	assert(!fclose(file));
	assert(!gpu_unlock_elf_section(data, (size_t)length, ".fwimage", &image));
	assert(!gpu_unlock_elf_section(data, (size_t)length, ".fwsignature_ga10x", &ga));
	assert(!gpu_unlock_elf_section(data, (size_t)length, ".fwsignature_ad10x", &ad));
	assert(image.offset == 64 && image.size == 84226048);
	assert(ga.size == 4096 && ad.offset == 84267118 && ad.size == 4096);
	assert(ga.offset != ad.offset && image.offset + image.size <= (size_t)length);
	free(data);
}

int main(int argc, char **argv)
{
	unsigned char elf[256];
	unsigned char image[64];
	unsigned char sigs[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
	unsigned char meta[GU_WPR_META_SIZE];
	struct gpu_unlock_span span;
	struct gpu_unlock_radix_plan radix;
	struct gpu_unlock_booter_hdr hdr = {
		.num_apps = 1,
		.patch_loc = 16,
		.num_sigs = 2,
		.sig_bytes = 8,
	};
	struct gpu_unlock_layout_in in = {
		.usable_fb = 24ull << 30,
		.vga_base = (24ull << 30) - (1024ull * 1024),
		.frts_size = 1024ull * 1024,
		.boot_size = 4096,
		.image_size = 64ull * 1024,
		.nonwpr_size = 1,
		.heap_request = 1024ull * 1024,
	};
	struct gpu_unlock_layout_out layout;
	struct gpu_unlock_wpr_args args = {
		.fb_size = in.usable_fb, .vga_offset = in.vga_base,
		.frts_size = in.frts_size, .signature_dma = 0x1000,
		.signature_size = 0xfa00, .radix_dma = 0x2000,
		.image_size = in.image_size, .boot_dma = 0x3000,
		.boot = { .code_offset = 256, .data_offset = 512, .image_size = 4096 },
	};
	struct gpu_unlock_booter_hdr ada_hdr = {
		.os_code_off = 0, .os_code_size = 256,
		.os_data_off = 32256, .os_data_size = 24576,
		.num_apps = 1, .app_code_off = 256, .app_code_size = 32000,
		.app_data_off = 256, .app_data_size = 0,
		.patch_loc = 32272, .ucode_id = 3, .engine_id = 1,
		.num_sigs = 2, .sig_bytes = 768,
	};
	struct gpu_unlock_booter_hdr ampere_hdr = ada_hdr;
	if (argc == 2)
		check_shared_gsp_sections(argv[1]);

	assert(!gpu_unlock_booter_validate(GU_BOOTER_AD10X, &ada_hdr, 56832, 768));
	assert(gpu_unlock_booter_validate(GU_BOOTER_GA10X, &ada_hdr, 56832, 768) == -EINVAL);
	ampere_hdr.os_data_off = 35328;
	ampere_hdr.os_data_size = 25088;
	ampere_hdr.app_code_size = 35072;
	ampere_hdr.patch_loc = 35344;
	assert(!gpu_unlock_booter_validate(GU_BOOTER_GA10X, &ampere_hdr, 60416, 768));
	assert(gpu_unlock_booter_validate(GU_BOOTER_AD10X, &ampere_hdr, 60416, 768) == -EINVAL);
	assert(gpu_unlock_booter_validate(GU_BOOTER_AD10X, &ada_hdr, ~0u, 768) == -EINVAL);
	assert(gpu_unlock_booter_validate(GU_BOOTER_AD10X, &ada_hdr, 56832, 384) == -EINVAL);
	assert(gpu_unlock_booter_validate(GU_BOOTER_AD10X, NULL, 56832, 768) == -EINVAL);
	assert(gpu_unlock_booter_validate((enum gpu_unlock_booter_arch)99,
					 &ada_hdr, 56832, 768) == -EOPNOTSUPP);

	assert(gpu_unlock_fuse_version(0) == 0);
	assert(gpu_unlock_fuse_version(1) == 1);
	assert(gpu_unlock_fuse_version(0x8) == 4);

	{
		/* Both pinned BooterLoad geometries are accepted, and nothing else. */
		struct gpu_unlock_booter_hdr ga = {
			.os_code_off = 0, .os_code_size = 256,
			.os_data_off = 35328, .os_data_size = 25088,
			.num_apps = 1, .app_code_off = 256, .app_code_size = 35072,
			.app_data_off = 256, .app_data_size = 0,
			.patch_loc = 35344, .ucode_id = 3, .engine_id = 1,
			.num_sigs = 2, .sig_bytes = GU_BOOTER_SIG_TOTAL,
		};
		struct gpu_unlock_booter_hdr ada = {
			.os_code_off = 0, .os_code_size = 256,
			.os_data_off = 32256, .os_data_size = 24576,
			.num_apps = 1, .app_code_off = 256, .app_code_size = 32000,
			.app_data_off = 256, .app_data_size = 0,
			.patch_loc = 32272, .ucode_id = 3, .engine_id = 1,
			.num_sigs = 2, .sig_bytes = GU_BOOTER_SIG_TOTAL,
		};
		const struct gpu_unlock_booter_geometry *g;

		g = gpu_unlock_booter_geometry_match(&ga, GU_BOOTER_IMAGE_SIZE,
						   GU_BOOTER_SIG_TOTAL);
		assert(g && g->image_size == GU_BOOTER_IMAGE_SIZE);
		g = gpu_unlock_booter_geometry_match(&ada, GU_BOOTER_IMAGE_SIZE_AD102,
						   GU_BOOTER_SIG_TOTAL);
		assert(g && g->image_size == GU_BOOTER_IMAGE_SIZE_AD102);
		/* The patch lands 16 bytes into DMEM in both layouts. */
		assert(g->hdr.patch_loc - g->hdr.os_data_off == 16);
		assert(ga.patch_loc - ga.os_data_off == 16);
		/* Size, signature size and field swaps are all rejected. */
		assert(!gpu_unlock_booter_geometry_match(&ada, GU_BOOTER_IMAGE_SIZE,
							GU_BOOTER_SIG_TOTAL));
		assert(!gpu_unlock_booter_geometry_match(&ga, GU_BOOTER_IMAGE_SIZE_AD102,
							GU_BOOTER_SIG_TOTAL));
		assert(!gpu_unlock_booter_geometry_match(&ada, GU_BOOTER_IMAGE_SIZE_AD102, 768u + 1));
		assert(!gpu_unlock_booter_geometry_match(NULL, GU_BOOTER_IMAGE_SIZE_AD102,
							GU_BOOTER_SIG_TOTAL));
		ada.patch_loc = 32256;
		assert(!gpu_unlock_booter_geometry_match(&ada, GU_BOOTER_IMAGE_SIZE_AD102,
							GU_BOOTER_SIG_TOTAL));
	}

	memset(image, 0, sizeof(image));
	assert(!gpu_unlock_booter_patch(image, sizeof(image), &hdr, sigs,
					sizeof(sigs), 0));
	assert(!memcmp(image + 16, sigs + 4, 4));
	assert(gpu_unlock_booter_patch(image, sizeof(image), &hdr, sigs,
				       sizeof(sigs), 2) == -ERANGE);

	memset(elf, 0, sizeof(elf));
	elf[0] = 0x7f;
	elf[1] = 'E';
	elf[2] = 'L';
	elf[3] = 'F';
	elf[4] = 2;
	elf[5] = 1;
	elf[6] = 1;
	put32(elf + 20, 1);
	put16(elf + 52, 64);
	put64(elf + 40, 64);
	put16(elf + 58, 64);
	put16(elf + 60, 2);
	put16(elf + 62, 1);
	put32(elf + 64, 0);
	put64(elf + 64 + 24, 220);
	put64(elf + 64 + 32, 4);
	put32(elf + 128, 9);
	put64(elf + 128 + 24, 192);
	put64(elf + 128 + 32, 16);
	memcpy(elf + 192, ".fwimage", 8);
	elf[200] = 0;
	memcpy(elf + 220, "name", 4);
	assert(!gpu_unlock_elf_section(elf, sizeof(elf), ".fwimage", &span));
	assert(span.offset == 220 && span.size == 4);
	assert(gpu_unlock_elf_section(elf, sizeof(elf), ".missing", &span) == -ENOENT);

	assert(!gpu_unlock_radix_plan(4096, &radix));
	assert(radix.pages[0] == 1 && radix.pages[3] == 1);
	assert(!gpu_unlock_radix_plan(4097, &radix));
	assert(radix.pages[3] == 2);
	assert(gpu_unlock_radix_plan(~(u64)0, &radix) == -EOVERFLOW);
	/* A name that ends at the string-table boundary must include its NUL. */
	put64(elf + 128 + 32, 8);
	assert(gpu_unlock_elf_section(elf, sizeof(elf), ".fwimage", &span) == -EINVAL);
	put64(elf + 128 + 32, 16);
	put32(elf + 128, 0);
	assert(gpu_unlock_elf_section(elf, sizeof(elf), ".fwimage", &span) == -EINVAL);
	assert(gpu_unlock_dma_cmd(true) == ((6u << 8) | (1u << 4) | (1u << 2)));
	assert(gpu_unlock_dma_cmd(false) == (6u << 8));

	assert(!gpu_unlock_layout(&in, &layout));
	assert(!gpu_unlock_wpr_meta_pack(meta, &layout, &args));
	assert(meta[0] == 0xb3 && meta[7] == 0xdc);
	assert(meta[72] == 0x00 && meta[73] == 0x10);
	assert(meta[49] == 1 && meta[57] == 2);
	assert(!memcmp(meta + 184, (unsigned char[]){0,0,0xf0,0xff,5,0,0,0}, 8));
	args.image_size = ~0ull;
	assert(gpu_unlock_wpr_meta_pack(meta, &layout, &args) == -EINVAL);
	{
		unsigned char desc[84] = {0}, page[GU_RADIX_PAGE];
		u64 addresses[] = {0x123456000ull, 0xdeadbe000ull};
		struct gpu_unlock_boot_desc boot;
		const u32 words[] = {5,20480,2176,22656,16,0,0,0,0,2048,2048,4096,6144,10496,1,0,0,0,0,24576,0};

		for (unsigned int i=0; i<21; i++) put32(desc+i*4,words[i]);
		assert(!gpu_unlock_boot_desc_parse(desc, sizeof(desc), 24576, &boot));
		assert(boot.code_offset == 6144 && boot.data_offset == 2048 && !boot.manifest_offset);
		assert(gpu_unlock_boot_desc_parse(desc, 83, 24576, &boot) == -EINVAL);
		put32(desc+48, ~0u);
		assert(gpu_unlock_boot_desc_parse(desc, 84, 24576, &boot) == -ERANGE);
		{
			/* The AD102 GSP boot image is 0x9000 with its own offsets. */
			const u32 ada[] = {5,32768,2176,34944,16,0,0,0,0,2048,2048,
					   16384,18432,10496,1,0,0,0,0,36864,0};

			for (unsigned int i=0; i<21; i++) put32(desc+i*4,ada[i]);
			assert(!gpu_unlock_boot_desc_parse(desc, 84, 36864, &boot));
			/* Same field order as GA102: manifest idx 8, data idx 10, code idx 12. */
			assert(boot.manifest_offset == 0 && boot.data_offset == 2048 &&
			       boot.code_offset == 18432 && boot.image_size == 36864);
			/* The descriptor must agree with the image it describes. */
			assert(gpu_unlock_boot_desc_parse(desc, 84, 24576, &boot) == -EINVAL);
		}
		assert(!gpu_unlock_radix_page(page, addresses, 2));
		assert(page[3] == 0x23 && page[4] == 1 && page[12] == 0xd);
		for (unsigned int i=16; i<sizeof(page); i++) assert(page[i] == 0);
		addresses[0]++;
		assert(gpu_unlock_radix_page(page, addresses, 2) == -EINVAL);
		assert(gpu_unlock_radix_page(page, addresses, 513) == -EINVAL);
	}

	puts("prep checks passed");
	return 0;
}
