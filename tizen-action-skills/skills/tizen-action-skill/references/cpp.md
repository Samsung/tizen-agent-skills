
# Tizen Action Framework — native C++ provider

This reference covers the workflow for a **native C++ Tizen service-application** (`capp`, using the Core `service_app_*` API) acting as a Tizen Action provider for an **existing, default action category**: run `actionc -l C++` → implement the generated `ServiceBase` → register it with a `Factory` via `Listen()`, then integrate into your app's C code.

**Scope reminder:** this only applies to `"type": "tidl"` actions, and only to **default categories already known to the framework**. If the developer actually wants an `appControl` or `plugin` action, redirect them — see `common.md`. If they want to define a brand-new action that no default category covers, redirect them to `custom-action.md` — once that skill produces a generated stub, come back here for the implementation step.

---

## Step 1 — Toolchain check

Before anything else, confirm `actionc` is actually usable: run `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the exact install command it prints — do not attempt to install the toolchain yourself.

---

## Step 2 — Confirm a default category covers this

Run `../scripts/list_categories.sh` (or `.ps1` on Windows), optionally with a filter keyword (e.g. `list_categories.sh Browser`), to see the default categories actually installed on this machine — read live from `$ACTIONC_DATA_DIR/actions`, so it never drifts from what `actionc -a` can actually resolve. To see which entity type(s) a specific action uses, read its `.action` file directly under `$ACTIONC_DATA_DIR/actions/`.

- **If a default category matches**: continue to Step 3 with `-a <Category>`.
- **If nothing matches**: no default category applies — go to `custom-action.md` to define the action first. Once that skill generates a stub, come back here for Step 4 (implementation + registration) using the generated file it produced.

---

## Step 3 — Run `actionc -l C++`

```bash
actionc -a Tizen.Action.<Category> -l C++ -o Impl<Category>
```

`../scripts/run_actionc.sh --language 'C++' -- -a Tizen.Action.<Category> -o Impl<Category>` wraps this and validates the language value; `../scripts/scaffold_action.sh --language 'C++' --category Tizen.Action.<Category> --out-name Impl<Category>` also checks the toolchain, generates into `./gen`, and lists the pure-virtual methods you need to override.

Run it from a `gen/` folder in your project (checked into source tree as third-party generated output):

```bash
mkdir -p gen && cd gen
actionc -a Tizen.Action.MultiView -l C++ -o ImplMultiView
```

This produces `ImplMultiView.h` and `ImplMultiView.cc`.

The generated header contains:
- Entity structs (e.g. `TizenEntityBrowser : TizenEntity`) for every entity the category uses.
- `TizenAction<Category>` — the RPC stub class, with a nested `ServiceBase` — **this is the class you implement in Step 4**. It declares one `virtual ... = 0` method per action in the category, named after the method suffix (e.g. action `Tv_Tizen.Action.Browser_OpenPage` → method `OpenPage`), plus a nested `ServiceBase::Factory` abstract class you must also implement.

**Read the generated header to get the exact pure-virtual method signatures before writing the implementation** — they vary per category.

---

## Step 4 — Implement `ServiceBase` + `Factory` in C++

`../assets/cpp_action_pattern.cc` is an annotated, generalized version of this pattern — read it alongside the generated header's pure-virtual methods. The shape:

```cpp
#include <dlog.h>
#include <memory>
#include "ImplMultiView.h"

#undef LOG_TAG
#define LOG_TAG "MULTIVIEW_ACTION"

// Use both namespaces: TizenEntityStatus is in implmultiview,
// TizenActionMultiView is in implmultiview::stub
using namespace rpc_port::implmultiview;
using namespace rpc_port::implmultiview::stub;

class MultiViewService : public TizenActionMultiView::ServiceBase {
 public:
  MultiViewService(std::string sender, std::string instance)
      : ServiceBase(std::move(sender), std::move(instance)) {}

  void OnCreate() override {
    dlog_print(DLOG_INFO, LOG_TAG, "Client connected: %s", GetSender().c_str());
  }

  void OnTerminate() override {
    dlog_print(DLOG_INFO, LOG_TAG, "Client disconnected: %s", GetSender().c_str());
  }

  TizenEntityStatus AddApp(TizenEntityApp app) override {
    dlog_print(DLOG_INFO, LOG_TAG, "AddApp: %s", app.GetAppId().c_str());
    return TizenEntityStatus(true, "Success");
  }

  // ... implement all other pure-virtual methods from the header ...
};

class MultiViewFactory : public TizenActionMultiView::ServiceBase::Factory {
 public:
  std::unique_ptr<TizenActionMultiView::ServiceBase> CreateService(
      std::string sender, std::string instance) override {
    return std::make_unique<MultiViewService>(std::move(sender), std::move(instance));
  }
};
```

**CRITICAL: C/C++ Linkage**

If your service app's `main()` or lifecycle callbacks are in **C code** (`service_app.c`), you must wrap the public init/deinit functions with `extern "C"` so the C code can find them:

```cpp
static std::unique_ptr<TizenActionMultiView> g_multiview_stub;

extern "C" {

void init_multiview_action_service(void) {
  dlog_print(DLOG_INFO, LOG_TAG, "Initializing MultiView action service");
  try {
    g_multiview_stub = std::make_unique<TizenActionMultiView>();
    g_multiview_stub->Listen(std::make_shared<MultiViewFactory>());
    dlog_print(DLOG_INFO, LOG_TAG, "MultiView action service initialized");
  } catch (const std::exception& e) {
    dlog_print(DLOG_ERROR, LOG_TAG, "Failed to initialize: %s", e.what());
  }
}

void deinit_multiview_action_service(void) {
  dlog_print(DLOG_INFO, LOG_TAG, "Deinitializing MultiView action service");
  g_multiview_stub.reset();
}

}  // extern "C"
```

Then in your C code (`service_app.c`):

```c
extern void init_multiview_action_service(void);
extern void deinit_multiview_action_service(void);

static bool service_create(void *user_data) {
  // ... other initialization ...
  init_multiview_action_service();
  return true;
}

static void service_terminate(void *user_data) {
  deinit_multiview_action_service();
  // ... other cleanup ...
}
```

---

## Step 5 — Wire into CMakeLists.txt

Here's a **complete, production-ready CMakeLists.txt** for a Tizen service app with Tizen Action:

```cmake
CMAKE_MINIMUM_REQUIRED(VERSION 3.12)

PROJECT(logsvc C CXX)

SET(PREFIX ${CMAKE_INSTALL_PREFIX})
SET(BINDIR "${CMAKE_INSTALL_PREFIX}/bin")
SET(RESDIR "${CMAKE_INSTALL_PREFIX}")

## Enable position-independent code (required for PIE executables)
SET(CMAKE_POSITION_INDEPENDENT_CODE ON)

## Compiler flags. Match the target toolchain; these are a sane default.
SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall")
SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -ffunction-sections")
SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fdata-sections")
SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIE")
SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fno-lto")
SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fno-lto")

IF(NOT ASAN_ENABLED)
  SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Werror")
ENDIF(NOT ASAN_ENABLED)

SET(CMAKE_EXE_LINKER_FLAGS "-Wl,--as-needed,--gc-sections -pie")

SET(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH}
  "${CMAKE_CURRENT_SOURCE_DIR}/cmake/Modules/")

## One variable per buildable unit; matches the manifest exec name.
SET(TARGET_LOGSVC "logsvc")

INCLUDE(FindPkgConfig)
INCLUDE(ApplyPkgConfig)

## Find all needed packages
PKG_CHECK_MODULES(SERVICE_APP_DEPS REQUIRED capi-appfw-service-application)
PKG_CHECK_MODULES(DLOG_DEPS REQUIRED dlog)
PKG_CHECK_MODULES(RPC_PORT_DEPS REQUIRED rpc-port)
PKG_CHECK_MODULES(APP_COMMON_DEPS REQUIRED capi-appfw-app-common)

## Collect source files
SET(SRCS
  ${CMAKE_CURRENT_SOURCE_DIR}/src/logsvc.c
  ${CMAKE_CURRENT_SOURCE_DIR}/src/multiview_action.cc
  ${CMAKE_CURRENT_SOURCE_DIR}/gen/ImplMultiView.cc
)

ADD_EXECUTABLE(${TARGET_LOGSVC} ${SRCS})
SET_TARGET_PROPERTIES(${TARGET_LOGSVC} PROPERTIES LINKER_LANGUAGE CXX)

## Disable LTO for this executable (LTO + PIE can cause linker issues with generated stubs)
SET_TARGET_PROPERTIES(${TARGET_LOGSVC} PROPERTIES INTERPROCEDURAL_OPTIMIZATION FALSE)

## Add include directories for generated stub code
TARGET_INCLUDE_DIRECTORIES(${TARGET_LOGSVC} PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/gen)

## Apply pkg-config dependencies
APPLY_PKG_CONFIG(${TARGET_LOGSVC} PUBLIC
  SERVICE_APP_DEPS
  DLOG_DEPS
  RPC_PORT_DEPS
  APP_COMMON_DEPS)

INSTALL(TARGETS ${TARGET_LOGSVC} DESTINATION ${BINDIR})
INSTALL(FILES ${CMAKE_CURRENT_SOURCE_DIR}/tizen-manifest.xml
  DESTINATION ${PREFIX})
INSTALL(FILES ${CMAKE_CURRENT_SOURCE_DIR}/tizen-manifest.xml
  DESTINATION /usr/share/packages RENAME org.example.logsvc.xml)
```

**Key points:**
- `-fno-lto`: Disables link-time optimization. Generated stub code may not be compatible with LTO + PIE, causing linker relocation errors.
- `-fPIC` / `CMAKE_POSITION_INDEPENDENT_CODE ON`: Required for executables with PIE (Position Independent Executable).
- Include the `gen/` folder so you can `#include "ImplMultiView.h"` directly (not `#include "gen/ImplMultiView.h"`).
- Link against `rpc-port`, `capi-appfw-service-application`, and `capi-appfw-app-common`.
- **Default categories**: `.action` and `.entity` files are provided by the framework; no INSTALL commands needed for res/.
- **Custom actions only**: a brand-new action's `.action`/`.entity` files are not in the framework data directory, so the package must ship them — add INSTALL commands putting them under `res/`. See `custom-action.md`.

---

## Step 6 — Register in tizen-manifest.xml

For each action your provider exposes, add **one** metadata entry in your `service-application` block in `tizen-manifest.xml`:

```xml
<service-application appid="org.example.logsvc" exec="logsvc" type="capp">
  <label>Log Service</label>

  <!-- Provider registration — one per exposed action -->
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.MultiView_AddApp"/>
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.MultiView_RemoveApp"/>
</service-application>
<privileges>
  <privilege>http://tizen.org/privilege/datasharing</privilege>
  <privilege>http://tizen.org/privilege/appmanager.launch</privilege>
</privileges>
```

**Key points:**
- **Only `action/provider` is registered** in the manifest — the framework resolves the actual `.action`/`.entity` files from its internal data directory.
- The value is the action's **`name` exactly** (e.g., `Tv_Tizen.Action.MultiView_AddApp`), not its category or filename.
- Add one `<metadata>` entry for every action the provider exposes, including when those actions share a category and TIDL interface.
- The manifest appid is recorded from provider metadata independently of
  `details.appid`; the schema value is only the fallback target.

---

## Step 7 — Update .spec file

Ensure your RPM spec file declares both build and runtime dependencies and installs metadata:

```spec
Name:       org.example.logsvc
Summary:    Example Tizen native service application
Version:    1.0.0
Release:    1
License:    Apache-2.0
Source0:    %{name}-%{version}.tar.gz
Source1001: %{name}.manifest

# Build dependencies
BuildRequires: cmake
BuildRequires: pkgconfig(capi-appfw-service-application)
BuildRequires: pkgconfig(dlog)
BuildRequires: pkgconfig(rpc-port)
BuildRequires: pkgconfig(capi-appfw-app-common)

%description
A Tizen native service application with Tizen Action support.

%prep
%setup -q
cp %{SOURCE1001} .

%build
%cmake . -DCMAKE_INSTALL_PREFIX=%{_appdir}
make %{?jobs:-j%jobs}

%install
rm -rf %{buildroot}
%make_install

%files
%manifest %{name}.manifest
%license LICENSE
%{_appdir}/bin/logsvc
%{_appdir}/tizen-manifest.xml
/usr/share/packages/org.example.logsvc.xml
```

**Critical:**
- For default categories, do not package `.action`/`.entity` files; the framework data directory supplies them. Package custom schemas only when defining custom actions.

---

## Step 8 — Verify and build

**Local build (before GBS):**

```bash
mkdir -p build && cd build
cmake .. -DCMAKE_INSTALL_PREFIX=/usr/apps/org.example.logsvc
make
```

If this succeeds, your code compiles and links correctly.

**GBS build:**

```bash
gbs build --profile <profile_name>
```

**On target, verify Action registration:**

```bash
action-tool get-action Tv_Tizen.Action.MultiView_AddApp
action-tool get-entity Example.Entity.CustomApp
action-tool search multiview --json
```

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `undefined reference to 'init_multiview_action_service'` | C code calling C++ function without `extern "C"` | Wrap C++ public functions with `extern "C" { ... }` |
| `'TizenEntityStatus' does not name a type` | Missing `using namespace rpc_port::implmultiview` | Add both: `using namespace rpc_port::implmultiview;` and `using namespace rpc_port::implmultiview::stub;` |
| `relocation R_ARM_THM_MOVW_ABS_NC against 'a local symbol' ... -fPIC` | Missing position-independent code flag | Set `CMAKE_POSITION_INDEPENDENT_CODE ON` in CMakeLists.txt |
| `ld returned 1 exit status` (with LTO + PIE) | LTO incompatibility with generated stub code | Disable LTO: add `-fno-lto` to CFLAGS/CXXFLAGS |
| `nothing provides pkgconfig(rpc-port)` | Build environment missing rpc-port development package | Install `rpc-port-devel` on build host |
| `action-tool get-action` returns nothing after deploy | Provider metadata mismatch | Check provider value = the `.action` `name` exactly (e.g., `Tv_Tizen.Action.MultiView_AddApp`) |
| `Action doesn't receive requests` | Provider metadata value doesn't match `.action` `"name"` field | Ensure provider metadata = `.action` `"name"` exactly and the provider app is enabled/selected |
| App crashes on `Listen()` call | `ServiceBase::Factory` not properly implemented or `std::make_shared` allocation failed | Verify `CreateService()` returns valid `unique_ptr<ServiceBase>`, check memory and exception handling |

---

## File structure

```
your-service-app/
├── CMakeLists.txt          (use the template above; installs app and package metadata)
├── src/
│   ├── logsvc.c            (C entry point, calls extern "C" init/deinit)
│   └── multiview_action.cc (C++ implementation, wrapped with extern "C")
├── gen/
│   ├── ImplMultiView.h     (generated by actionc)
│   └── ImplMultiView.cc    (generated by actionc)
├── packaging/
│   └── org.example.logsvc.spec  (include rpc-port and app-common build dependencies)
└── tizen-manifest.xml      (include per-action provider metadata and privileges)
```

**Note:** For default categories, no `actions/` or `entities/` source folders are needed — the framework provides them. Only a custom action (see `custom-action.md`) requires maintaining those folders and installing them into `res/`.
