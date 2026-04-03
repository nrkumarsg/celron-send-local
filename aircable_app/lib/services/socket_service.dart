import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:shared_preferences/shared_preferences.dart';

class SocketService {
  late IO.Socket socket;
  final _peerController = StreamController<List<dynamic>>.broadcast();
  Stream<List<dynamic>> get peersStream => _peerController.stream;

  final _connectionController = StreamController<bool>.broadcast();
  Stream<bool> get connectionStream => _connectionController.stream;

  String? myId;
  String myName = "Unknown Device";

  Future<void> init(String serverUrl) async {
    final prefs = await SharedPreferences.getInstance();
    myName = prefs.getString('celron_device_name') ?? "Device ${DateTime.now().millisecond}";

    socket = IO.io(serverUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .disableAutoConnect()
      .build());

    socket.onConnect((_) {
      myId = socket.id;
      _connectionController.add(true);
      register();
    });

    socket.onDisconnect((_) => _connectionController.add(false));

    socket.on('peers-update', (data) {
      _peerController.add(data as List<dynamic>);
    });

    socket.connect();
  }

  void register() {
    socket.emit('register', {
      'name': myName,
      'deviceType': 'Mobile', // We can detect this later
    });
  }

  void updateName(String newName) async {
    myName = newName;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('celron_device_name', newName);
    register();
  }

  void dispose() {
    socket.dispose();
    _peerController.close();
    _connectionController.close();
  }
}
