/* SPDX-License-Identifier: GPL-2.0-only */
/* Just enough kernel for main.c. Async work runs on real threads, so the
 * test sees true concurrency and main.c's own synchronization. */
#ifndef MAIN_SHIM_H
#define MAIN_SHIM_H
#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <strings.h>

#define __init
#define __exit
#define module_param(name, type, perm)
#define MODULE_PARM_DESC(name, desc)
#define MODULE_LICENSE(x)
#define MODULE_DESCRIPTION(x)
#define MODULE_VERSION(x)
/* Keep the entry points reachable so the test calls what the kernel would. */
#define module_init(fn) int (*test_module_init)(void) = fn;
#define module_exit(fn) void (*test_module_exit)(void) = fn;

#define PCI_VENDOR_ID_NVIDIA 0x10de
#define PCI_ANY_ID (~0u)
#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
struct pci_dev {
	const char *name;
	unsigned short vendor, device;
	void *driver;
	int refs;
	pthread_mutex_t lock;
	pthread_t owner;
	bool locked;
};
struct pci_dev *pci_get_device(unsigned int vendor, unsigned int device, struct pci_dev *from);
struct pci_dev *pci_dev_get(struct pci_dev *);
void pci_dev_put(struct pci_dev *);
void pci_dev_lock(struct pci_dev *);
void pci_dev_unlock(struct pci_dev *);
static inline const char *pci_name(const struct pci_dev *pdev) { return pdev->name; }

void test_log(const struct pci_dev *, const char *, ...) __attribute__((format(printf, 2, 3)));
#define pci_err(pdev, ...) test_log(pdev, __VA_ARGS__)
#define pci_info(pdev, ...) test_log(pdev, __VA_ARGS__)
#define pr_err(...) test_log(NULL, __VA_ARGS__)

typedef uint64_t async_cookie_t;
typedef void (*async_func_t)(void *data, async_cookie_t cookie);
struct async_domain {
	pthread_mutex_t lock;
	pthread_t threads[16];
	unsigned int count;
};
#define ASYNC_DOMAIN_EXCLUSIVE(name) struct async_domain name = { .lock = PTHREAD_MUTEX_INITIALIZER }
async_cookie_t async_schedule_domain(async_func_t, void *, struct async_domain *);
void async_synchronize_full_domain(struct async_domain *);
#endif
