import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:aircable_app/services/socket_service.dart';
import 'package:aircable_app/theme.dart';
import 'package:qr_flutter/qr_flutter.dart';

class HomeScreen extends StatefulWidget {
  final SocketService socketService;

  const HomeScreen({super.key, required this.socketService});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final String serverUrl = "https://celronsendlocal.onrender.com"; // User's live URL

  @override
  void initState() {
    super.initState();
    widget.socketService.init(serverUrl);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          color: AppTheme.bgColor,
          gradient: const RadialGradient(
            center: Alignment(0.15, -0.5),
            radius: 0.8,
            colors: [Color(0x202ECC71), Colors.transparent],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 20),
                _buildNetworkInfo(),
                const SizedBox(height: 20),
                Expanded(child: _buildPeersList()),
                _buildTransfersArea(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
      decoration: BoxDecoration(
        color: AppTheme.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white, width: 1.5),
      ),
      child: Row(
        children: [
          Image.asset('assets/logo.png', width: 40, height: 40, errorBuilder: (_, __, ___) => const Icon(Icons.flash_on, color: AppTheme.ecoGreen, size: 40)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("AirCable", style: Theme.of(context).textTheme.headlineSmall),
                Text("ECO-FRIENDLY P2P", style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppTheme.ecoGreen, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          StreamBuilder<bool>(
            stream: widget.socketService.connectionStream,
            initialData: false,
            builder: (context, snapshot) {
              return Container(
                width: 10, height: 10,
                decoration: BoxDecoration(
                  color: snapshot.data == true ? AppTheme.ecoGreen : Colors.red,
                  shape: BoxShape.circle,
                ),
              );
            }
          ),
        ],
      ),
    );
  }

  Widget _buildNetworkInfo() {
    return _buildGlassCard(
      child: Column(
        children: [
          const Text("Receive Files", style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          QrImageView(
            data: serverUrl,
            version: QrVersions.auto,
            size: 150.0,
            foregroundColor: AppTheme.textPrimary,
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.5),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.link, size: 16, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Expanded(child: Text(serverUrl, style: const TextStyle(fontSize: 12, color: AppTheme.primaryColor), overflow: TextOverflow.ellipsis)),
                const Icon(Icons.copy, size: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPeersList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text("Nearby Devices", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            IconButton(onPressed: () => widget.socketService.register(), icon: const Icon(Icons.refresh)),
          ],
        ),
        const SizedBox(height: 10),
        Expanded(
          child: StreamBuilder<List<dynamic>>(
            stream: widget.socketService.peersStream,
            initialData: const [],
            builder: (context, snapshot) {
              final peers = snapshot.data ?? [];
              if (peers.isEmpty) {
                return const Center(child: Text("Waiting for other devices..."));
              }
              return GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.2),
                itemCount: peers.length,
                itemBuilder: (context, index) {
                  final peer = peers[index];
                  return _buildPeerCard(peer);
                },
              );
            }
          ),
        ),
      ],
    );
  }

  Widget _buildPeerCard(Map<String, dynamic> peer) {
    final bool isMobile = peer['deviceType'] == 'Mobile';
    return InkWell(
      onTap: () {
        // Trigger file selection for this peer
      },
      child: _buildGlassCard(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(isMobile ? Icons.smartphone : Icons.desktop_windows, size: 40, color: AppTheme.primaryColor),
            const SizedBox(height: 8),
            Text(peer['name'], style: const TextStyle(fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
            Text(peer['deviceType'], style: const TextStyle(fontSize: 12, color: Colors.blueGrey)),
          ],
        ),
      ),
    );
  }

  Widget _buildTransfersArea() {
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)],
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          Text("Active Transfers", style: TextStyle(color: AppTheme.ecoGreen, fontWeight: FontWeight.bold)),
          Text("History", style: TextStyle(color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildGlassCard({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 15, offset: const Offset(0, 5))],
        border: Border.all(color: Colors.white.withOpacity(0.5), width: 1.5),
      ),
      padding: const EdgeInsets.all(15),
      child: child,
    );
  }
}
