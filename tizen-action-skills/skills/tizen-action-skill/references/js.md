
# Tizen Action Framework — Web (JavaScript) provider

This reference covers the workflow for a **Tizen Web app** (WRT — plain HTML/CSS/JS, no npm or bundler) acting as a Tizen Action provider for an **existing, default action category**: run `actionc -l JS` → implement the generated `ServiceBase` class → register it with `stub.listen()`. It stops there — `config.xml` wiring, `.wgt` packaging/signing, deploying to a device, and testing via `action-tool execute`/`dlogutil` are outside this reference's scope; help with those only if asked, using general Tizen Web knowledge rather than tooling bundled here.

**Scope reminder:** this only applies to `"type": "tidl"` actions, and only to **default categories already known to the framework**. If the developer actually wants an `appControl` or `plugin` action, redirect them — see `common.md`. If they want to define a brand-new action that no default category covers, redirect them to `custom-action.md` — once that skill produces a generated stub, come back here for the implementation step.

For the `actionc` CLI reference, read `common.md`. Default categories aren't documented statically — they're read live from the installed toolchain via `../scripts/list_categories.sh`/`.ps1`. For `.action`/`.entity` schema details, read `custom-action.md` — don't re-derive that here.

## Step 1 — Toolchain check

Before anything else, confirm `actionc` is actually usable: run `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the exact install command it prints — do not attempt to install the toolchain yourself, since that persistently modifies their shell profile or Windows environment variables.

## Step 2 — Confirm a default category covers this

Run `../scripts/list_categories.sh` (or `.ps1` on Windows), optionally with a filter keyword (e.g. `list_categories.sh Browser`), to see the default categories actually installed on this machine — read live from `$ACTIONC_DATA_DIR/actions`, so it never drifts from what `actionc -a` can actually resolve. To see which entity type(s) a specific action uses, read its `.action` file directly under `$ACTIONC_DATA_DIR/actions/`.

- **If a default category matches**: continue to Step 3 with `-a <Category>`.
- **If nothing matches**: no default category applies — go to `custom-action.md` to define the action first. Once that skill generates a stub, come back here for Step 4 (implementation + registration) using the generated file it produced.

## Step 3 — Run `actionc -l JS`

```bash
actionc -a Tizen.Action.<Category> -l JS -o Impl<Category>
```

`../scripts/run_actionc.sh --language JS -- -a Tizen.Action.<Category> -o Impl<Category>` wraps this and validates the language value. Run it from your web app's `js/` folder; it produces a single `Impl<Category>.js` targeting the `tizen.rpcport` WebAPI.

`../scripts/scaffold_action.sh --language JS --category Tizen.Action.<Category> --out-name Impl<Category>` goes further: it checks the toolchain, generates into `./js`, and then lists the `on<Method>` stubs you need to override.

The generated file contains, among other things:
- Entity classes (e.g. `TizenEntityBrowser`) with `serialize`/`deserialize` methods, mirroring every `.entity` file the category's actions reference.
- **`<Interface>ServiceBase`** (e.g. `TizenActionBrowserServiceBase`, named `<Category-as-PascalCase-interface>ServiceBase` — note this is a plain top-level class, not nested, and it is **not namespaced**, unlike the C++/C# generated code) — **this is the class you implement in Step 4**. It declares empty `on<Method>(...) {}` stub methods, one per action in the category, named after the method suffix of the action's `name` with an `on` prefix (e.g. action `Tv_Tizen.Action.Browser_OpenPage` → method `onOpenPage`).
- **`<Interface>`** (e.g. `TizenActionBrowser`, extends `_rpc.StubBase`) — the RPC stub object you instantiate and call `.listen()` on.

**Read the generated file to get the exact `on<Method>` parameter lists before writing the implementation** — they vary per category (some take an `out`-style `result` parameter to fill in) and shouldn't be guessed.

⚠️ Because the generated classes are global (not namespaced/module-scoped), **if a single app ever implements two categories, their generated files must use distinct class names** — this is a real collision risk worth flagging to the developer if they mention wanting more than one category.

## Step 4 — Implement the `ServiceBase` class and register with `stub.listen()`

`../assets/js_action_pattern.js` is an annotated, generalized version of this pattern (based on the real `ActionSampleAppJs` sample) — read it alongside the generated file's `on<Method>` stubs. The shape:

```js
class <Category>Service extends <Interface>ServiceBase {
  constructor(sender, instance) { super(sender, instance); }

  onCreate() { /* a client connected */ }
  onTerminate() { /* a client disconnected */ }

  // One override per on<Method> stub in the generated ServiceBase.
  // Entity results that come back via an `out`-style `result` parameter are
  // filled in by setting its fields directly (it's passed in already
  // constructed) rather than returned separately.
  on<Method>(input) {
    // ... actual business logic here ...
    const status = new TizenEntityStatus();
    status.Success = true;
    status.Reason = "";
    return status;
  }
}
```

Registration happens **via a closure factory function, not a `Type` or a separate `Factory` object** — this is the third of the four registration patterns (contrast with C#'s `Listen(typeof(...))`, C++'s `Factory` instance, and Dart's `await listen()`). Call it from a `window.load` handler so it runs once the page (and the `tizen.rpcport` WebAPI) is ready:

```js
let stub = null;

function start() {
  if (typeof tizen === 'undefined' || !tizen.rpcport) {
    console.error('tizen.rpcport WebAPI is not available');
    return;
  }
  try {
    stub = new <Interface>(function (sender, instance) {
      return new <Category>Service(sender, instance);
    });
    stub.listen();
  } catch (e) {
    console.error('Listen failed: ' + e.message);
  }
}

window.addEventListener('load', function () {
  start();
});
```

Load order matters: `<script src="js/Impl<Category>.js">` must come **before** `<script src="js/main.js">` (or wherever `start()` lives) in `index.html`, since the generated file defines the classes `main.js` depends on.

## Step 5 — Register in config.xml

For each action your provider exposes, add **one** metadata entry in your `config.xml`, and enable background support:

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

  <!-- CRITICAL: allow RPC-port requests while app is in background -->
  <tizen:setting background-support="enable"/>

  <tizen:privilege name="http://tizen.org/privilege/datasharing"/>
  <tizen:privilege name="http://tizen.org/privilege/appmanager.launch"/>
</widget>
```

**Key points:**
- **Only `action/provider` is registered** in the config — the framework resolves the actual `.action`/`.entity` files from its internal data directory.
- The value is the action's **`name` exactly** (e.g., `Tv_Tizen.Action.Browser_OpenPage`), not its category or filename.
- **Use `<tizen:metadata>` with the `tizen:` namespace** — this is required in `config.xml` (unlike C#'s `tizen-manifest.xml` which uses plain `<metadata>`).
- **`background-support="enable"` is essential** — without it, your web app's JavaScript is suspended when another app takes the foreground, and the action service stops responding to RPC-port requests. With it enabled, the `stub.listen()` callback continues running even while the app is backgrounded.
- Add one `<tizen:metadata>` entry for every action the provider exposes, including when those actions share a category and TIDL interface.
- Add the default-operation `<tizen:app-control>` shown above with `reload="disable"`; otherwise a proxy-triggered relaunch reloads the page and destroys the listening stub.
- Declare `datasharing` and `appmanager.launch` privileges. Filesystem privileges are needed only for optional sample-style file logging.
- Provider metadata records the config app `id` independently of
  `details.appid`; the schema value is only the fallback target.

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — either the category name is misspelled, or the toolchain env isn't set up (re-run Step 1's check script). If the category genuinely doesn't exist yet, this isn't a default category — see `custom-action.md`.
- **`ReferenceError: <Interface>ServiceBase is not defined`** — the generated `Impl<Category>.js` `<script>` tag is missing or loaded after your implementation file; fix the load order in `index.html`.
- **`tizen.rpcport WebAPI is not available`** — this only exists inside the Tizen Web Runtime on-device/emulator; it will not exist when previewing the page in a normal desktop browser.
- **`stub.listen()` throws** — check the error message; a common cause is the app's `config.xml` not declaring provider metadata for every exposed action.
- **Action requests timeout or the app doesn't respond** — verify `<tizen:setting background-support="enable"/>` is in your `config.xml`. Without it, the action service stops when the app is backgrounded.
