# Tizen Action Framework — .NET (C#) provider

This reference covers a **Tizen.NET (C#) `NUIApplication`** acting as a Tizen Action provider: run `actionc -l C#` → implement the generated `ServiceBase` → register it with `Listen(typeof(...))` → declare provider metadata. Building the `.csproj`, signing, and deploying follow the usual Tizen .NET workflow; there is no Action-specific build step.

**Scope reminder:** `"type": "tidl"` actions only. For a brand-new action that no default category covers, start with `custom-action.md`, then come back here at Step 4. For the shared conventions (output parameters, subscriptions, request routing, on-device verification), read `common.md`.

## Contents

- [Step 1 — Toolchain check](#step-1--toolchain-check)
- [Step 2 — Confirm a default category covers this](#step-2--confirm-a-default-category-covers-this)
- [Step 3 — Run `actionc -l C#`](#step-3--run-actionc--l-c)
- [Step 4 — Implement `ServiceBase` and register](#step-4--implement-servicebase-and-register-with-listentypeof)
- [Step 5 — Register in tizen-manifest.xml](#step-5--register-in-tizen-manifestxml)
- [Step 6 — Verify on a device](#step-6--verify-on-a-device)
- [Troubleshooting](#troubleshooting)

## Step 1 — Toolchain check

Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the setup command it prints — do not install the toolchain yourself.

## Step 2 — Confirm a default category covers this

Run `bash scripts/list_categories.sh` (or `.ps1`), optionally with a keyword (e.g. `Browser`), then read the matching `.action` files under `$ACTIONC_DATA_DIR/actions/` for exact names and entity types. If nothing matches, go to `custom-action.md`.

## Step 3 — Run `actionc -l C#`

```bash
mkdir -p gen && cd gen
actionc -a Tizen.Action.<Category> -l C# -o Impl<Category>
```

`bash scripts/scaffold_action.sh --language 'C#' --category Tizen.Action.<Category> --out-name Impl<Category>` does the same into `./gen` after checking the toolchain, then lists the abstract methods to override.

The generated `Impl<Category>.cs` contains:
- `namespace RPCPort.Impl<Category>` — entity classes (e.g. `TizenEntityWebPageInfo : TizenEntity`) with public fields; optional primitives are nullable (`int?`).
- `namespace RPCPort.Impl<Category>.Stub` — `TizenAction<Category> : StubBase`, with a nested `public abstract class ServiceBase` (**the class you implement**) declaring one `public abstract` method per action, and a nested `ActionServiceProxy`.

**Read the generated file before writing the implementation.** For `Tizen.Action.Browser`, for instance:

```csharp
public abstract TizenEntityStatus OpenPage(TizenEntityWebPageInfo webPageInfo);
public abstract TizenEntityStatus GetCurrentPage(out TizenEntityWebPageInfo result);
public abstract TizenEntityStatus GetTabs(out List<TizenEntityTab> result);
```

## Step 4 — Implement `ServiceBase` and register with `Listen(typeof(...))`

`assets/cs_action_pattern.cs` is an annotated version of this pattern — read it alongside the generated abstract methods.

```csharp
class BrowserService : TizenActionBrowser.ServiceBase
{
    public override void OnCreate() { /* a client connected */ }
    public override void OnTerminate() { /* a client disconnected */ }

    public override TizenEntityStatus OpenPage(TizenEntityWebPageInfo webPageInfo)
    {
        // ... business logic ...
        return new TizenEntityStatus { Success = true, Reason = "" };
    }

    // `out` parameters must be assigned on every path. An optional result
    // may be null; a list result must be a new list.
    public override TizenEntityStatus GetCurrentPage(out TizenEntityWebPageInfo result)
    {
        result = new TizenEntityWebPageInfo();
        // result.Url = ...;
        return new TizenEntityStatus { Success = true, Reason = "" };
    }

    // ... one override per abstract method. For an action you do not
    // provide, assign the outs and return Success = false, Reason =
    // "not_supported" — and do not register it in the manifest.
}
```

Registration happens **by `Type`** — the stub constructs a fresh service per connecting client through reflection. Register in `OnCreate()` of your `NUIApplication`:

```csharp
class Program : NUIApplication
{
    private TizenActionBrowser _stub;

    protected override void OnCreate()
    {
        base.OnCreate();
        _stub = new TizenActionBrowser();
        try
        {
            _stub.Listen(typeof(BrowserService));
        }
        catch (Exception e)
        {
            Log.Error(LogTag, $"Failed to listen: {e.Message}");
        }
    }

    protected override void OnTerminate()
    {
        base.OnTerminate();
        _stub = null;
    }

    static void Main(string[] args) => new Program().Run(args);
}
```

A subscription action (`eventSchema`) takes the generated `<Method>Event` as its last parameter (`TizenEntityStatus Watch(WatchEvent @event)`). Store it, call `@event.Invoke(...)` per event, catch the exception it throws once the client is gone, and drop stored events in `OnTerminate()`.

## Step 5 — Register in tizen-manifest.xml

Add **one** provider metadata entry per exposed action in the `ui-application` block:

```xml
<ui-application appid="org.example.mysvc" exec="MyService.dll" type="dotnet" multiple="false" taskmanage="true" nodisplay="false" launch_mode="single" api-version="11">
  <label>My Service</label>

  <!-- Provider registration — one per exposed action -->
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.Browser_GetCurrentPage"/>
  <metadata key="http://tizen.org/metadata/action/provider"
            value="Tv_Tizen.Action.Browser_OpenPage"/>
</ui-application>
<privileges>
  <privilege>http://tizen.org/privilege/datasharing</privilege>
  <privilege>http://tizen.org/privilege/appmanager.launch</privilege>
</privileges>
```

**Key points:**
- The value is the action's **`name` exactly**, not its category or filename. One entry per action, even when they share a category (or one entry with a `;`-separated list).
- For a default category, register only `action/provider` — the framework already has the `.action`/`.entity` files. A custom category also needs the `action` and `action/entity` entries and ships its schema files in `res/` (see `custom-action.md`).
- The manifest appid becomes the provider. A default category's `details.appid` names the platform's own app, so callers reach yours through `params.appid` or `action-tool default-app set`.
- Declare `datasharing` and `appmanager.launch`, plus any `requiredPrivileges` the actions list.

## Step 6 — Verify on a device

Install the package, then follow [Verify on a device](common.md#verify-on-a-device): `find-appids` must list your appid, and `execute` with your `appid` must exit 0.

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — misspelled category, or `ACTIONC_DATA_DIR` is wrong (re-run Step 1). If the category does not exist, see `custom-action.md`.
- **"does not implement inherited abstract member ..."** — an override is missing; copy the exact signature, including `out` parameters, from the generated file.
- **"The out parameter must be assigned"** — assign every `out` on every return path, including failures.
- **`Listen(typeof(...))` throws `ArgumentException`** — the type does not derive from `TizenAction<Category>.ServiceBase`, or has no accessible constructor.
- **`execute` fails without reaching the app** — `find-appids` does not list it (metadata value is not the exact action name), or the request carries no `appid` and your app is not the default app.
- **Calls fail although the build and registration look right** — the stub came from a pre-protocol-3 toolchain; re-run Step 1 and regenerate.
