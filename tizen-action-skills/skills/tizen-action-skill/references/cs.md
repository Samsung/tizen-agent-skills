
# Tizen Action Framework — .NET (C#) provider

This reference covers the workflow for a **Tizen.NET (C#) `NUIApplication`** acting as a Tizen Action provider for an **existing, default action category**: run `actionc -l C#` → implement the generated `ServiceBase` → register it with `Listen(typeof(...))`. It stops there — building the `.csproj`, wiring `TizenFxPath`, packaging, deploying to a device, and testing via `action-tool execute`/`dlogutil` are outside this reference's scope; help with those only if asked, using general Tizen/.NET knowledge rather than tooling bundled here.

**Scope reminder:** this only applies to `"type": "tidl"` actions, and only to **default categories already known to the framework**. If the developer actually wants an `appControl` or `plugin` action, redirect them — see `common.md`. If they want to define a brand-new action that no default category covers, redirect them to `custom-action.md` — once that skill produces a generated stub, come back here for the implementation step.

For the `actionc` CLI reference, read `common.md`. Default categories aren't documented statically — they're read live from the installed toolchain via `../scripts/list_categories.sh`/`.ps1`. For `.action`/`.entity` schema details, read `custom-action.md` — don't re-derive that here.

## Step 1 — Toolchain check

Before anything else, confirm `actionc` is actually usable: run `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the exact install command it prints — do not attempt to install the toolchain yourself, since that persistently modifies their shell profile or Windows environment variables.

## Step 2 — Confirm a default category covers this

Run `../scripts/list_categories.sh` (or `.ps1` on Windows), optionally with a filter keyword (e.g. `list_categories.sh Browser`), to see the default categories actually installed on this machine — read live from `$ACTIONC_DATA_DIR/actions`, so it never drifts from what `actionc -a` can actually resolve. To see which entity type(s) a specific action uses, read its `.action` file directly under `$ACTIONC_DATA_DIR/actions/`.

- **If a default category matches**: continue to Step 3 with `-a <Category>`.
- **If nothing matches**: no default category applies — go to `custom-action.md` to define the action first. Once that skill generates a stub, come back here for Step 4 (implementation + registration) using the generated file it produced.

## Step 3 — Run `actionc -l C#`

```bash
actionc -a Tizen.Action.<Category> -l C# -o Impl<Category>
```

`../scripts/run_actionc.sh --language 'C#' -- -a Tizen.Action.<Category> -o Impl<Category>` wraps this and validates the language value. Run it from wherever you want the generated file to land (conventionally a `gen/` folder next to `Program.cs`); it produces one file, `Impl<Category>.cs`.

`../scripts/scaffold_action.sh --language 'C#' --category Tizen.Action.<Category> --out-name Impl<Category>` goes further: it checks the toolchain, generates into `./gen`, and then lists the abstract methods you need to override, which saves grepping the generated file by hand.

The generated file (`namespace RPCPort.Impl<Category>.Stub`) contains, among other things:
- Entity classes (e.g. `TizenEntityBrowser : TizenEntity`) mirroring every `.entity` file the category's actions reference.
- `TizenAction<Category> : StubBase`, with a nested `public abstract class ServiceBase` — **this is the class you implement in Step 4**. It declares one `public abstract` method per action in the category, named after the method suffix of the action's `name` (e.g. action `Tv_Tizen.Action.Browser_OpenPage` → method `OpenPage`).

**Read the generated file to get the exact abstract method signatures before writing the implementation** — they vary per category (number of parameters, `out` parameters for entity results) and shouldn't be guessed.

## Step 4 — Implement `ServiceBase` and register with `Listen(typeof(...))`

`../assets/cs_action_pattern.cs` is an annotated, generalized version of this pattern (based on the real `ActionSampleAppCs` sample) — read it alongside the generated file's abstract methods. The shape:

```csharp
class <Category>Service : TizenAction<Category>.ServiceBase
{
    public override void OnCreate() { /* a client connected */ }
    public override void OnTerminate() { /* a client disconnected */ }

    // One override per abstract method in the generated ServiceBase.
    // Entity results that come back via an `out` parameter (multi-value returns)
    // must be `new`-ed up and have their fields set directly — there's no builder.
    public override TizenEntityStatus <Method>(<InputEntityType> input)
    {
        // ... actual business logic here ...
        var status = new TizenEntityStatus();
        status.Success = true;
        status.Reason = "";
        return status;
    }
}
```

Registration happens **by `Type`, not by an instance or factory** — this is the key difference from the C++ provider (`cpp.md`), which uses a `Factory` object instead. Register inside `OnCreate()` of your app's `NUIApplication` subclass:

```csharp
class Program : NUIApplication
{
    private TizenAction<Category> _stub;

    protected override void OnCreate()
    {
        base.OnCreate();
        _stub = new TizenAction<Category>();
        try
        {
            _stub.Listen(typeof(<Category>Service));
        }
        catch (Exception e)
        {
            Log.Error(LogTag, $"Failed to listen: {e.Message}");
            return;
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

Internally, `Listen(typeof(...))` uses reflection to instantiate a fresh `<Category>Service` per connecting client — you never construct it yourself.

## Step 5 — Register in tizen-manifest.xml

For each action your provider exposes, add **one** metadata entry in your `ui-application` block in `tizen-manifest.xml`:

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
- **Only `action/provider` is registered** in the manifest — the framework resolves the actual `.action`/`.entity` files from its internal data directory.
- The value is the action's **`name` exactly** (e.g., `Tv_Tizen.Action.Browser_OpenPage`), not its category or filename.
- Add one `<metadata>` entry for every action the provider exposes, including when those actions share a category and TIDL interface.
- The manifest appid is recorded from provider metadata independently of
  `details.appid`; the schema value is only the fallback target.
- Declare `http://tizen.org/privilege/datasharing` and `http://tizen.org/privilege/appmanager.launch`, as in the reference app.

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — either the category name is misspelled, or the toolchain env isn't set up (re-run Step 1's check script). If the category genuinely doesn't exist yet, this isn't a default category — see `custom-action.md`.
- **Compile error: "does not implement inherited abstract member ..."** — you're missing an override for one of the generated `ServiceBase`'s abstract methods; re-read the generated file to get the exact signature (especially `out` parameters, which are easy to miss).
- **`Listen(typeof(...))` throws `ArgumentException`** — the type you passed doesn't derive from `TizenAction<Category>.ServiceBase`, or isn't public/doesn't have an accessible constructor.
