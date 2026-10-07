// Annotated reference pattern for implementing a Tizen Action provider in
// Tizen.NET (C#), generalized with <Category>/<Method> placeholders since
// the actual abstract method list depends on which category you generated
// with actionc.
//
// Do not copy this file verbatim into a project — read the actual generated
// Impl<Category>.cs first (from `actionc -l C#`) to get the real method
// signatures, then adapt this pattern around them.

using System;
using Tizen;
using Tizen.Applications;
using Tizen.NUI;
using RPCPort.Impl<Category>.Stub;
using RPCPort.Impl<Category>;

namespace YourAppNamespace
{
    class Program : NUIApplication
    {
        internal static string LogTag = "YOUR_APP_LOG_TAG"; // pick one consistent tag, grep it in dlogutil later

        // The class you actually write: subclass the generated ServiceBase and
        // override every abstract method it declares (read the generated file
        // to know exactly which ones — this is illustrative, not exhaustive).
        class <Category>Service : TizenAction<Category>.ServiceBase
        {
            // Called once per connecting client. Sender/Instance identify the caller.
            public override void OnCreate()
            {
                Log.Info(LogTag, $"Client connected: Sender={Sender}, Instance={Instance}");
            }

            public override void OnTerminate()
            {
                Log.Info(LogTag, $"Client disconnected: Sender={Sender}, Instance={Instance}");
            }

            // Simple case: action takes an entity in, returns a TizenEntityStatus.
            public override TizenEntityStatus <Method>(TizenEntity<InputEntity> input)
            {
                // ... real business logic goes here, e.g. call into your app's own services ...

                var status = new TizenEntityStatus();
                status.Success = true;
                status.Reason = "";
                return status;
            }

            // Multi-value case: the action's outputSchema wraps a `return` (status)
            // and a `result` (another entity) — the generated method signature puts
            // the extra result in an `out` parameter. Assign it on every path: a new
            // entity with its fields set, `null` when the result is optional and
            // there is none, or a new List<T> for a list result.
            public override TizenEntityStatus <OtherMethod>(TizenEntity<InputEntity> input, out TizenEntity<ResultEntity> result)
            {
                result = new TizenEntity<ResultEntity>();
                // result.SomeField = ...;

                var status = new TizenEntityStatus();
                status.Success = true;
                status.Reason = "";
                return status;
            }

            // Subscription case (the .action declares an eventSchema): the
            // generated <Method>Event is the LAST parameter. Keep it, call
            // Invoke() per event inside try/catch (it throws once the client is
            // gone), and drop it in OnTerminate().
        }

        // The generated "stub" object — construct one and Listen() on it at startup.
        private TizenAction<Category> _stub;

        protected override void OnCreate()
        {
            base.OnCreate();
            _stub = new TizenAction<Category>();
            try
            {
                // Registration is BY TYPE, not by instance or factory — the stub's
                // internals use reflection to construct a fresh <Category>Service
                // per connecting client (C++ hands it a Factory instance instead).
                _stub.Listen(typeof(<Category>Service));
            }
            catch (Exception e)
            {
                Log.Error(LogTag, $"Failed to listen: {e.Message}");
                return;
            }
            Log.Info(LogTag, "Stub is listening");
        }

        protected override void OnTerminate()
        {
            base.OnTerminate();
            _stub = null;
        }

        static void Main(string[] args)
        {
            var app = new Program();
            app.Run(args);
        }
    }
}
