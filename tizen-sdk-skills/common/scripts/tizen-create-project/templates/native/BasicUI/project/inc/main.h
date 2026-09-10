#ifndef __$(appNameWithoutHyphen)_H__
#define __$(appNameWithoutHyphen)_H__

#include <dlog.h>

#ifdef  LOG_TAG
#undef  LOG_TAG
#endif
#define LOG_TAG "$(appName)"

#ifndef PACKAGE
#define PACKAGE "$(packageName)"
#endif

#ifndef PACKAGE_NAME
#define PACKAGE_NAME "$(packageName)"
#endif

#endif /* __$(appNameWithoutHyphen)_H__ */
