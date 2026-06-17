/*
 * NVIDIA 590.x / glibc 2.39 compatibility stubs.
 *
 * Vast.ai's Ubuntu 24.04 container is paired with a host-mounted NVIDIA 590.48.01
 * userspace that was built against an older glibc/Xorg stack. The driver's init
 * paths reference symbols removed in glibc 2.34+ and Xorg server internals that
 * are not present in a headless container.
 *
 * Pre-loading this tiny shared library satisfies those references so the official
 * NVIDIA 590 runfile userspace can initialise Vulkan on the RTX 3090.
 */
#include <stdlib.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

/* glibc 2.34+ removed these hooks; older NVIDIA drivers still reference them. */
void *__malloc_hook = NULL;
void *__realloc_hook = NULL;
void *__free_hook = NULL;
void *__memalign_hook = NULL;

/* Xorg server internal logging function used by NVIDIA GLX/Vulkan init paths. */
void ErrorF(const char *f, ...) {
    va_list ap;
    va_start(ap, f);
    vfprintf(stderr, f, ap);
    va_end(ap);
}

/* Stubs for Xorg server internal helpers that the driver calls conditionally. */
int miCreateDefColormap(void) { return 0; }

void *xf86ProcessOptions(void) { return NULL; }
