/* Annotated reference pattern for implementing a Tizen Action provider in a
 * Tizen Web app (WRT, plain JS, no npm/bundler). Based on the real
 * ActionSampleAppJs sample, generalized with <Category>/<Method> placeholders
 * since the actual on<Method> stub list depends on which category you
 * generated with actionc.
 *
 * Do not copy this file verbatim into a project — read the actual generated
 * Impl<Category>.js first (from `actionc -l JS`) to get the real on<Method>
 * parameter lists, then adapt this pattern around them. Load Impl<Category>.js
 * via a <script> tag BEFORE this file in index.html.
 */

(function () {
  'use strict';

  var stub = null;

  // The class you actually write: extend the generated <Interface>ServiceBase
  // and override every on<Method> stub it declares (read the generated file
  // to know exactly which ones — this is illustrative, not exhaustive).
  // NOTE: the generated ServiceBase class name is NOT namespaced (e.g. it's
  // literally `TizenActionBrowserServiceBase`, not `MyApp.TizenActionBrowserServiceBase`),
  // so if your app ever implements two categories, make sure their class
  // names don't collide.
  class <Category>Service extends <Interface>ServiceBase {
    constructor(sender, instance) {
      super(sender, instance);
    }

    // Called once per connecting client.
    onCreate() {
      console.log('Client connected: ' + this.sender + '/' + this.instance);
    }

    onTerminate() {
      console.log('Client disconnected: ' + this.sender + '/' + this.instance);
    }

    // Simple case: action takes an entity in, returns a TizenEntityStatus.
    on<Method>(input) {
      // ... real business logic goes here, e.g. call into your app's own logic ...

      let status = new TizenEntityStatus();
      status.Success = true;
      status.Reason = "";
      return status;
    }

    // Multi-value case: the action's outputSchema wraps a `return` (status)
    // and a `result` (another entity) — the generated method signature passes
    // the result entity in ALREADY CONSTRUCTED as a parameter; fill in its
    // fields directly rather than constructing/returning a new one.
    on<OtherMethod>(input, result) {
      result.SomeField = "...";

      let status = new TizenEntityStatus();
      status.Success = true;
      status.Reason = "";
      return status;
    }
  }

  // Registration happens via a CLOSURE FACTORY FUNCTION, not a Type (contrast
  // with the .NET platform skill's Listen(typeof(...))) and not a separate
  // Factory object (contrast with the C++ platform skill's Factory instance).
  // The function is called once per connecting client to produce a fresh
  // <Category>Service.
  function start() {
    if (typeof tizen === 'undefined') {
      console.error('tizen global object is not available!');
      return;
    }
    if (!tizen.rpcport) {
      console.error('tizen.rpcport WebAPI is not available!');
      return;
    }
    try {
      stub = new <Interface>(function (sender, instance) {
        return new <Category>Service(sender, instance);
      });
      stub.listen();
      console.log('Listening on port "<Interface>"');
    } catch (e) {
      console.error('Listen failed: ' + e.message);
    }
  }

  // Registration runs once the page (and the tizen.rpcport WebAPI) is ready.
  window.addEventListener('load', function () {
    start();
  });
})();
