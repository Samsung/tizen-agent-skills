
# Tizen Action Framework — Flutter-Tizen/Dart provider

This reference covers only `"type": "tidl"` actions in a default category. For toolchain setup and category lookup, read `common.md`; for custom `.action`/`.entity` schemas, use `custom-action.md` first.

## 1. Check inputs and generate the stub

Run `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows) first. Regenerate checked-in stubs only with the same toolchain they were generated with — see the toolchain compatibility note in `common.md`.

Confirm the category with `../scripts/list_categories.sh` (or `.ps1`), inspect its `.action` files for the exact actions, then generate from `lib/`:

```bash
mkdir -p lib && cd lib
actionc -a Tizen.Action.<Category> -l Dart -o Impl<Category>
```

`../scripts/run_actionc.sh --language Dart -- -a Tizen.Action.<Category> -o Impl<Category>` wraps this and validates the language value; `../scripts/scaffold_action.sh --language Dart --category Tizen.Action.<Category> --out-name Impl<Category>` also checks the toolchain, generates into `./lib`, and lists the handlers to override. Either way you get `lib/Impl<Category>.dart`. Never guess signatures: inspect its `Future<TizenEntityStatus> on<Method>(...)` declarations before implementing.

## 2. Add Flutter-Tizen RPC wiring

Start with `flutter-tizen create`, then add the local `tizen_rpc_port` plugin to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  tizen_rpc_port:
    path: /path/to/plugins/packages/tizen_rpc_port
```

Adapt `../assets/dart_action_pattern.dart` in `lib/main.dart`. The essential rules are:

- Extend the generated global `ServiceBase`.
- Implement `onCreate`, `onTerminate`, and every `on<Method>` handler as `Future` methods.
- Mutate output entities/lists passed to handlers; do not replace the output parameter.
- Keep the generated `TizenAction<Category>` stub alive in `State`, call `await listen()` once from `initState`, and call `close()` in `dispose`.
- Prefix `print()` logs with an app dlog tag, e.g. `[TIDL_ACTION_MYAPP]`.

## 3. Register every exposed action

In `tizen/tizen-manifest.xml`, use a Flutter-Tizen `ui-application` (`exec="Runner.dll"`, `type="dotnet"`). Register every action `name`, not the category, and declare the sample's required privileges:

```xml
<ui-application appid="org.example.myactionappdart" exec="Runner.dll" type="dotnet"
                multiple="false" nodisplay="false" taskmanage="true">
  <label>MyActionAppDart</label>
  <metadata key="http://tizen.org/metadata/prefer_dotnet_aot" value="true"/>
  <metadata key="http://tizen.org/metadata/prefer_nuget_cache" value="true"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_GetCurrentPage"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_OpenPage"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_ToCalendar"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_ToPresentation"/>
</ui-application>
<privileges>
  <privilege>http://tizen.org/privilege/datasharing</privilege>
  <privilege>http://tizen.org/privilege/appmanager.launch</privilege>
</privileges>
```

Provider metadata records the manifest `appid` independently of each action
file's `details.appid`; the schema value is only the fallback target.

## 4. Build and verify

Build with `flutter-tizen build tpk --debug`, install the resulting `.tpk`, then launch the UI app before invoking `action-tool`; unlike native providers, the Flutter listener must already be running. Check logs with `dlogutil` using the app dlog tag.

## Troubleshooting

- **Handler never runs / type error** — copy the exact generated `on<Method>` signature; output values are mutable parameters.
- **`tizen_rpc_port` import fails** — fix the plugin path/version in `pubspec.yaml`, then run the Flutter dependency command required by the project.
- **Action cannot discover the app** — add one provider metadata row for every action `name`, then verify the provider is enabled and selected.
- **Action times out** — launch the Flutter app first and confirm `await _stub.listen()` succeeded in dlog.