// Adapt this to the exact types and signatures in lib/Impl<Category>.dart.
import 'package:flutter/material.dart';
import 'Impl<Category>.dart';

class <Category>Service extends ServiceBase {
  <Category>Service(super.sender, super.instance);

  @override
  Future<void> onCreate() async {
    print('[TIDL_ACTION_MYAPP] connected: sender=$sender instance=$instance');
  }

  @override
  Future<void> onTerminate() async {
    print('[TIDL_ACTION_MYAPP] disconnected: sender=$sender instance=$instance');
  }

  // Copy the exact on<Method> signature from the generated stub.
  @override
  Future<TizenEntityStatus> on<Method>(TizenEntity<Input> input) async {
    return TizenEntityStatus()
      ..Success = true
      ..Reason = '';
  }

  // Output parameters (copy the exact type from the generated stub):
  //   Out<TizenEntity<Result>?> result -> set result.value (optional entity)
  //   TizenEntity<Result> result       -> mutate its fields (required entity)
  //   List<TizenEntity<Result>> result -> add() to it (list)
  // Never reassign the parameter itself.
  // @override
  // Future<TizenEntityStatus> on<OtherMethod>(TizenEntity<Input> input,
  //     Out<TizenEntity<Result>?> result) async {
  //   result.value = TizenEntity<Result>()..SomeField = '...';
  //   return TizenEntityStatus()..Success = true..Reason = '';
  // }

  // Subscription (the .action declares an eventSchema): the generated
  // <Method>Event is the LAST parameter. Keep it, call event.invoke(...) per
  // event inside try/catch, and drop it in onTerminate().
}

class ActionProviderPage extends StatefulWidget {
  const ActionProviderPage({super.key});

  @override
  State<ActionProviderPage> createState() => _ActionProviderPageState();
}

class _ActionProviderPageState extends State<ActionProviderPage> {
  TizenAction<Category>? _stub;

  @override
  void initState() {
    super.initState();
    _startService();
  }

  Future<void> _startService() async {
    try {
      _stub = TizenAction<Category>(
        serviceBuilder: (String sender, String instance) =>
            <Category>Service(sender, instance),
      );
      await _stub!.listen();
      print('[TIDL_ACTION_MYAPP] listening on TizenAction<Category>');
    } catch (e) {
      print('[TIDL_ACTION_MYAPP] listen failed: $e');
    }
  }

  @override
  void dispose() {
    _stub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}