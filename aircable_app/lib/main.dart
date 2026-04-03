import 'package:flutter/material.dart';
import 'package:aircable_app/theme.dart';
import 'package:aircable_app/screens/home_screen.dart';
import 'package:aircable_app/services/socket_service.dart';
import 'package:provider/provider.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        Provider<SocketService>(create: (_) => SocketService()),
      ],
      child: const AirCableApp(),
    ),
  );
}

class AirCableApp extends StatelessWidget {
  const AirCableApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AirCable',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: Consumer<SocketService>(
        builder: (context, socketService, _) {
          return HomeScreen(socketService: socketService);
        },
      ),
    );
  }
}
