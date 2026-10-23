# SPDX-License-Identifier: GPL-2.0-only
# Out-of-tree build of the read-only sampler against the running kernel.
#   make            (needs LLVM=1 when the kernel was built with clang)
#   make clean
obj-m += gpu_peek.o

KDIR ?= /lib/modules/$(shell uname -r)/build

# Only touches the kernel tree's module build, never installs anything.
all:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean

.PHONY: all clean
