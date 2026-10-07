# Tizen Action Framework — Web (JavaScript) provider

This reference covers a **Tizen Web app** (WRT — plain HTML/CSS/JS, no npm or bundler) acting as a Tizen Action provider: run `actionc -l JS` → implement the generated `ServiceBase` class → register it with `stub.listen()` → declare provider metadata in `config.xml`. Packaging and signing the `.wgt` follow the usual Tizen Web workflow.

**Scope reminder:** `"type": "tidl"` actions only. For a brand-new action that no default category covers, start with `custom-action.md`, then come back here at Step 4. For the shared conventions (output parameters, subscriptions, request routing, on-device verification), read `common.md`.

## Contents

- [Step 1 — Toolchain check](#step-1--toolchain-check)
- [Step 2 — Confirm a default category covers this](#step-2--confirm-a-default-category-covers-this)
- [Step 3 — Run `actionc -l JS`](#step-3--run-actionc--l-js)
- [Step 4 — Implement the `ServiceBase` class and register](#step-4--implement-the-servicebase-class-and-register-with-stublisten)
- [Step 5 — Register in config.xml](#step-5--register-in-configxml)
- [Step 6 — Verify on a device](#step-6--verify-on-a-device)
- [Troubleshooting](#troubleshooting)

## Step 1 — Toolchain check

Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the setup command it prints — do not install the toolchain yourself.

## Step 2 — Confirm a default category covers this

Run `bash scripts/list_categories.sh` (or `.ps1`), optionally with a keyword (e.g. `Browser`), then read the matching `.action` files under `$ACTIONC_DATA_DIR/actions/` for exact names and entity types. If nothing matches, go to `custom-action.md`.

## Step 3 — Run `actionc -l JS`

```bash
cd js
actionc -a Tizen.Action.<Category> -l JS -o Impl<Category>
```

`bash scripts/scaffold_action.sh --language JS --category Tizen.Action.<Category> --out-name Impl<Category>` does the same into `./js` after checking the toolchain, then lists the `on<Method>` stubs to override. The result is one `Impl<Category>.js` targeting the `tizen.rpcport` WebAPI.

The generated file defines **global classes** (no module, no namespace):
- Entity classes (e.g. `TizenEntityWebPageInfo extends TizenEntity`) with public fields and `serialize`/`deserialize`.
- `<Interface>ServiceBase` (e.g. `TizenActionBrowserServiceBase`) — **the class you extend**. It declares empty `on<Method>(...) {}` stubs, one per action (`Tv_Tizen.Action.Browser_OpenPage` → `onOpenPage`).
- `<Interface>` (e.g. `TizenActionBrowser extends _rpc.StubBase`) — the stub you construct and call `.listen()` on.
- `ActionServiceProxy` and, for subscription actions, a `<Interface>_<Method>Event` delegate class.

Because the classes are global, an app that implements two categories must generate them under names that don't collide.

**Read the generated file before writing the implementation.** Each `_dispatch<Method>` function shows exactly what it passes in and reads back.

## Step 4 — Implement the `ServiceBase` class and register with `stub.listen()`

`assets/js_action_pattern.js` is an annotated version of this pattern — read it alongside the generated `on<Method>` stubs.

Handlers run **synchronously**: the dispatcher serializes the returned `TizenEntityStatus` immediately, so a handler must not be `async` or return a Promise. Do slow work ahead of time, or return a failure status.

Output parameters follow `common.md`; in JS:
- **optional single result** — a holder `{ value: null }`: set `result.value = new TizenEntityX()`.
- **required single result** — a pre-built entity: set its fields.
- **list result** — a pre-built array: `result.push(...)`.

```js
class BrowserService extends TizenActionBrowserServiceBase {
  constructor(sender, instance) { super(sender, instance); }

  onCreate() { /* a client connected */ }
  onTerminate() { /* a client disconnected */ }

  onOpenPage(webPageInfo) {
    // ... business logic ...
    const status = new TizenEntityStatus();
    status.Success = true;
    return status;
  }

  onGetCurrentPage(result) {          // optional result: { value: null }
    const page = new TizenEntityWebPageInfo();
    page.Url = location.href;
    result.value = page;
    const status = new TizenEntityStatus();
    status.Success = true;
    return status;
  }
}
```

Registration passes **a closure** that builds one service per connecting client. Call it once the page (and `tizen.rpcport`) is ready:

```js
let stub = null;

window.addEventListener('load', function () {
  try {
    stub = new TizenActionBrowser(function (sender, instance) {
      return new BrowserService(sender, instance);
    });
    stub.listen();
  } catch (e) {
    console.error('Listen failed: ' + e.message);
  }
});
```

Load order matters: `<script src="js/Impl<Category>.js">` must come **before** the script that defines the service.

A subscription action receives the delegate as its last parameter (`onWatch(event)`). Keep it, call `event.invoke(entity)` per event inside `try/catch`, and drop it in `onTerminate()`.

## Step 5 — Register in config.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
  <tizen:application id="org.example.mywebsvc" package="org.example" required_version="9.0"/>
  <!-- Keep the listener alive when a proxy triggers the default app-control. -->
  <tizen:app-control>
    <tizen:src name="index.html" reload="disable"/>
    <tizen:operation name="http://tizen.org/appcontrol/operation/default"/>
  </tizen:app-control>

  <!-- Provider registration — one per exposed action -->
  <tizen:metadata key="http://tizen.org/metadata/action/provider"
                  value="Tv_Tizen.Action.Browser_GetCurrentPage"/>
  <tizen:metadata key="http://tizen.org/metadata/action/provider"
                  value="Tv_Tizen.Action.Browser_OpenPage"/>

  <!-- Keep answering RPC-port requests while the app is in the background -->
  <tizen:setting background-support="enable"/>

  <tizen:privilege name="http://tizen.org/privilege/datasharing"/>
  <tizen:privilege name="http://tizen.org/privilege/appmanager.launch"/>
</widget>
```

**Key points:**
- The value is the action's **`name` exactly**, not its category or filename. One entry per action (or one entry with a `;`-separated list).
- Use `<tizen:metadata>` with the `tizen:` namespace in `config.xml`.
- For a default category, register only `action/provider`. A custom category also needs the `action` and `action/entity` entries, with the files in the widget's `res/` directory — see `custom-action.md`.
- `background-support="enable"` keeps the JavaScript running while another app is in the foreground; without it, requests time out.
- The default-operation `<tizen:app-control>` with `reload="disable"` keeps a proxy-triggered relaunch from reloading the page and destroying the listening stub.
- The application `id` becomes the provider. A default category's `details.appid` names the platform's own app, so callers reach yours through `params.appid` or `action-tool default-app set`.

## Step 6 — Verify on a device

Install the `.wgt`, then follow [Verify on a device](common.md#verify-on-a-device).

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — misspelled category, or `ACTIONC_DATA_DIR` is wrong (re-run Step 1). If the category does not exist, see `custom-action.md`.
- **`ReferenceError: <Interface>ServiceBase is not defined`** — the generated script tag is missing or loaded after your implementation.
- **`ReferenceError: tizen is not defined`** at load — the page runs outside the Tizen Web Runtime (e.g. a desktop browser); `tizen.rpcport` only exists on a device or emulator.
- **`TypeError: _ret.serialize is not a function`** — a handler is `async`, returned a Promise, or returned nothing; return a `TizenEntityStatus` synchronously.
- **The caller always receives `null` for a result** — an optional result was assigned to the parameter (`result = …`) instead of `result.value = …`.
- **`execute` fails without reaching the app** — `find-appids` does not list it, or the request carries no `appid` and the app is not the default app.
- **Requests time out while the app is in the background** — `<tizen:setting background-support="enable"/>` is missing.
