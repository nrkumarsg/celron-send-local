import 'dart:async';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class WebRTCService {
  final IO.Socket socket;
  final Map<String, RTCPeerConnection> _peerConnections = {};
  final Map<String, RTCDataChannel> _dataChannels = {};
  
  // Streams for UI
  final _transferController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get transferStream => _transferController.stream;

  WebRTCService(this.socket) {
    _setupSocketListeners();
  }

  void _setupSocketListeners() {
    socket.on('offer', (data) async {
      await _handleOffer(data);
    });

    socket.on('answer', (data) async {
      await _handleAnswer(data);
    });

    socket.on('ice-candidate', (data) async {
      await _handleIceCandidate(data);
    });
  }

  Future<RTCPeerConnection> _createPeerConnection(String targetId) async {
    final Map<String, dynamic> configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
      ]
    };

    final pc = await createPeerConnection(configuration);
    
    pc.onIceCandidate = (candidate) {
      socket.emit('ice-candidate', {
        'target': targetId,
        'candidate': candidate.toMap()
      });
    };

    pc.onDataChannel = (channel) {
      _setupDataChannel(channel, targetId);
    };

    _peerConnections[targetId] = pc;
    return pc;
  }

  void _setupDataChannel(RTCDataChannel channel, String peerId) {
    _dataChannels[peerId] = channel;
    
    channel.onDataChannelState = (state) {
      print('Data Channel State: $state');
    };

    channel.onMessage = (data) {
      if (data.isBinary) {
        // Handle incoming file chunk
        _handleIncomingChunk(peerId, data.binary);
      } else {
        // Handle control message (DONE, etc)
        if (data.text == 'DONE') {
          _finishTransfer(peerId);
        }
      }
    };
  }

  Future<void> _handleOffer(Map<String, dynamic> data) async {
    final String senderId = data['sender'];
    final pc = await _createPeerConnection(senderId);
    
    await pc.setRemoteDescription(RTCSessionDescription(data['sdp']['sdp'], data['sdp']['type']));
    
    final answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
      'target': senderId,
      'sdp': {
        'type': answer.type,
        'sdp': answer.sdp
      }
    });
    
    _transferController.add({
      'type': 'incoming',
      'peerId': senderId,
      'meta': data['meta']
    });
  }

  Future<void> _handleAnswer(Map<String, dynamic> data) async {
    final pc = _peerConnections[data['sender']];
    if (pc != null) {
      await pc.setRemoteDescription(RTCSessionDescription(data['sdp']['sdp'], data['sdp']['type']));
    }
  }

  Future<void> _handleIceCandidate(Map<String, dynamic> data) async {
    final pc = _peerConnections[data['sender']];
    if (pc != null) {
      await pc.addCandidate(RTCIceCandidate(
        data['candidate']['candidate'],
        data['candidate']['sdpMid'],
        data['candidate']['sdpMLineIndex']
      ));
    }
  }

  void _handleIncomingChunk(String peerId, List<int> chunk) {
    // Collect chunks in memory (or better yet, write to disk)
    // For this prototype, we'll emit progress
    _transferController.add({
      'type': 'progress',
      'peerId': peerId,
      'received': chunk.length
    });
  }

  void _finishTransfer(String peerId) {
     _transferController.add({
      'type': 'complete',
      'peerId': peerId
    });
  }
}
