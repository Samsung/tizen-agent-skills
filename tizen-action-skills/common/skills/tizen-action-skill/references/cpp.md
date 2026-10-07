# Tizen Action Framework — native C++ provider

This reference covers a **native C++ Tizen service application** (`capp`, Core `service_app_*` API) acting as a Tizen Action provider: run `actionc -l C++` → implement the generated `ServiceBase` and its `Factory` → `Listen()` → declare provider metadata. The framework's reference implementations are `samples/tidl-type` (a default category) and `samples/tidl-custom-action` (an app-defined category) in the `tizen-action` repository.

**Scope reminder:** `"type": "tidl"` actions only. For a brand-new action that no default category covers, start with `custom-action.md`, then come back here at Step 4. For the shared conventions (output parameters, subscriptions, request routing, on-device verification), read `common.md`.

## Contents

- [Step 1 — Toolchain check](#step-1--toolchain-check)
- [Step 2 — Confirm a default category covers this](#step-2--confirm-a-default-category-covers-this)
- [Step 3 — Run `actionc -l C++`](#step-3--run-actionc--l-c)
- [Step 4 — Implement `ServiceBase` + `Factory`](#step-4--implement-servicebase--factory)
- [Step 5 — Build rules](#step-5--build-rules)
- [Step 6 — Register in tizen-manifest.xml](#step-6--register-in-tizen-manifestxml)
- [Step 7 — Verify on a device](#step-7--verify-on-a-device)
- [Troubleshooting](#troubleshooting)

## Step 1 — Toolchain check

Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the setup command it prints — do not install the toolchain yourself.

## Step 2 — Confirm a default category covers this

Run `bash scripts/list_categories.sh` (or `.ps1`), optionally with a keyword (e.g. `Browser`), then read the matching `.action` files under `$ACTIONC_DATA_DIR/actions/` for exact names and entity types. If nothing matches, go to `custom-action.md`.

## Step 3 — Run `actionc -l C++`

Generate into a `gen/` folder and commit the output — the package build compiles it without running `actionc`:

```bash
mkdir -p gen && cd gen
actionc -a Tizen.Action.Browser -l C++ -o ImplBrowser
```

`bash scripts/scaffold_action.sh --language 'C++' --category Tizen.Action.<Category> --out-name Impl<Category>` does the same into `./gen` after checking the toolchain, then lists the pure-virtual methods. Add `--log-stdout` to `actionc` when the generated code should log to stdout instead of dlog (host-side tests).

`ImplBrowser.h` contains:
- `namespace rpc_port::implbrowser` — entity classes with getters/setters (e.g. `TizenEntityWebPageInfo::GetUrl()`); optional fields are `std::optional<T>`, including the inherited `Id`/`Extra`. The namespace is the lowercased `-o` name.
- `namespace rpc_port::implbrowser::stub` — `TizenActionBrowser` (the stub you `Listen()` on) with a nested `ServiceBase` (**the class you implement**) and `ServiceBase::Factory`, the `Exception` hierarchy, and an `ActionServiceProxy`.

**Read the generated header before writing the implementation.** For `Tizen.Action.Browser`, for instance:

```cpp
virtual TizenEntityStatus OpenPage(TizenEntityWebPageInfo webPageInfo) = 0;
virtual TizenEntityStatus GetCurrentPage(std::optional<TizenEntityWebPageInfo>& result) = 0;
virtual TizenEntityStatus GetTabs(std::vector<TizenEntityTab>& result) = 0;
virtual TizenEntityStatus Search(TizenEntityBrowserQuery browserQuery, TizenEntityBrowserSearchResult& result) = 0;
```

## Step 4 — Implement `ServiceBase` + `Factory`

`assets/cpp_action_pattern.cc` is a complete annotated `service_app` built on this pattern — read it alongside the generated header.

```cpp
#include <dlog.h>

#include <memory>
#include <optional>
#include <string>

#include "ImplBrowser.h"

#undef LOG_TAG
#define LOG_TAG "MY_BROWSER_PROVIDER"

namespace gen = rpc_port::implbrowser;
using gen::stub::TizenActionBrowser;

class BrowserService : public TizenActionBrowser::ServiceBase {
 public:
  BrowserService(std::string sender, std::string instance)
      : ServiceBase(std::move(sender), std::move(instance)) {}

  void OnCreate() override {
    dlog_print(DLOG_INFO, LOG_TAG, "client connected: %s", GetSender().c_str());
  }

  void OnTerminate() override {}

  gen::TizenEntityStatus OpenPage(gen::TizenEntityWebPageInfo page) override {
    dlog_print(DLOG_INFO, LOG_TAG, "OpenPage: %s", page.GetUrl().c_str());
    return gen::TizenEntityStatus(true, "");
  }

  // Optional out-parameter: leave it empty or assign a value.
  gen::TizenEntityStatus GetCurrentPage(
      std::optional<gen::TizenEntityWebPageInfo>& result) override {
    gen::TizenEntityWebPageInfo page;
    page.SetUrl("https://www.tizen.org");
    result = std::move(page);
    return gen::TizenEntityStatus(true, "");
  }

  // ... one override per pure-virtual method. For an action you do not
  // provide, return TizenEntityStatus(false, "not_supported") and do not
  // register it in the manifest.
};

class BrowserFactory : public TizenActionBrowser::ServiceBase::Factory {
 public:
  std::unique_ptr<TizenActionBrowser::ServiceBase> CreateService(
      std::string sender, std::string instance) override {
    return std::make_unique<BrowserService>(std::move(sender),
                                            std::move(instance));
  }
};
```

Create the stub in the service app's `create` callback and keep it alive until `terminate`:

```cpp
std::unique_ptr<TizenActionBrowser> g_stub;

bool OnCreate(void*) {
  g_stub = std::make_unique<TizenActionBrowser>();
  try {
    g_stub->Listen(std::make_shared<BrowserFactory>());
  } catch (const gen::stub::Exception& e) {
    dlog_print(DLOG_ERROR, LOG_TAG, "Listen failed: %s", e.what());
    return false;
  }
  return true;
}

void OnTerminate(void*) { g_stub.reset(); }
```

If `main()` and the lifecycle callbacks are in a **C** file, expose `init`/`deinit` functions from the C++ file inside `extern "C" { ... }` and call those from C.

A subscription action (`eventSchema`) takes the generated `<Method>Event` as its last parameter (`TizenEntityStatus Watch(std::unique_ptr<WatchEvent> event)`). Keep the handle, call `event->Invoke(...)` per event inside `try { … } catch (const gen::stub::Exception&)`, and clear the handles in `OnTerminate()`. `samples/tidl-custom-action/src/bookmark_service.cc` shows the complete pattern. Each client has its own service object, so protect state shared across them.

## Step 5 — Build rules

Dependencies of the generated code plus the service app:

```cmake
INCLUDE(FindPkgConfig)
PKG_CHECK_MODULES(PROVIDER_DEPS REQUIRED
  rpc-port bundle dlog glib-2.0
  capi-appfw-service-application capi-appfw-app-common)

ADD_EXECUTABLE(${TARGET} src/browser_service.cc gen/ImplBrowser.cc)
TARGET_INCLUDE_DIRECTORIES(${TARGET} PRIVATE gen ${PROVIDER_DEPS_INCLUDE_DIRS})
TARGET_COMPILE_OPTIONS(${TARGET} PRIVATE ${PROVIDER_DEPS_CFLAGS_OTHER} -fPIE)
TARGET_LINK_LIBRARIES(${TARGET} ${PROVIDER_DEPS_LIBRARIES} "-pie" "-ldl")
# Generated code is not written for -Werror; keep warnings fatal elsewhere.
SET_SOURCE_FILES_PROPERTIES(gen/ImplBrowser.cc PROPERTIES COMPILE_FLAGS "-Wno-error")
```

- Build the provider as an ordinary Tizen app: a `.tpk` from Tizen Studio/CLI for a store app, or an RPM (GBS) for a platform package as in the framework samples. An RPM spec needs the matching `BuildRequires: pkgconfig(...)` lines and installs the manifest to both the app directory and `/usr/share/packages/<pkgid>.xml`.
- Default categories: do not install `.action`/`.entity` files. Custom categories: install them into the app's `res/`, as `samples/tidl-custom-action/CMakeLists.txt` does.

## Step 6 — Register in tizen-manifest.xml

Add **one** provider metadata entry per exposed action in the `service-application` block:

```xml
<service-application appid="org.example.browserprovider" exec="browser-provider" type="capp"
                     multiple="false" taskmanage="false">
  <label>Browser Provider</label>
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.Browser_OpenPage"/>
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.Browser_GetCurrentPage"/>
</service-application>
<privileges>
  <privilege>http://tizen.org/privilege/datasharing</privilege>
  <privilege>http://tizen.org/privilege/appmanager.launch</privilege>
</privileges>
```

**Key points:**
- The value is the action's **`name` exactly**, not its category or filename. One entry per action (or one entry with a `;`-separated list).
- For a default category, register only `action/provider`. A custom category also needs the `action` and `action/entity` entries — see `custom-action.md`.
- The manifest appid becomes the provider. A default category's `details.appid` names the platform's own app, so callers reach yours through `params.appid` or `action-tool default-app set`.
- Declare `datasharing` and `appmanager.launch`, plus any `requiredPrivileges` the actions list.

## Step 7 — Verify on a device

Install the package, then follow [Verify on a device](common.md#verify-on-a-device). `samples/*/run.sh` in the framework repository script the same checks.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `'TizenEntityStatus' does not name a type` | Entities live in `rpc_port::impl<name>`, the stub in `rpc_port::impl<name>::stub` | Qualify both namespaces (or alias them as above) |
| `cannot declare variable ... to be of abstract type` | A pure-virtual method is not overridden, or its signature differs | Copy every signature from the generated header, including `std::optional<…>&` outs |
| `no match for 'operator=' ... std::optional` / `.c_str()` on optional | An optional field or output was used as a plain value | Use `value_or()`, `has_value()`, or assign a `T` to the `std::optional<T>&` |
| `undefined reference to 'init_..._service'` | C code calls a C++ function without `extern "C"` | Wrap the C-callable functions in `extern "C" { ... }` |
| `undefined reference to 'dlopen'` | Generated code uses `dlfcn` | Link `-ldl` |
| `nothing provides pkgconfig(rpc-port)` | Build root lacks the devel package | Install `rpc-port-devel` (and the other `pkgconfig(...)` deps) |
| `action-tool find-appids` does not list the app | Provider metadata value is not the exact `.action` `name` | Fix the value and reinstall |
| `execute` fails without reaching the app | No `appid` in the request and the app is not the default | Pass `"appid"` in `params`, or `action-tool default-app set` |
| Calls fail although build and registration look right | Stub generated by a pre-protocol-3 toolchain | Re-run Step 1 and regenerate |
| App crashes on `Listen()` | `Factory::CreateService()` returns null or throws | Return a valid `std::unique_ptr<ServiceBase>` |
