import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/auth_storage.dart';
import '../../shared/theme/app_theme.dart';

class ChatTab extends StatefulWidget {
  final String? initialOtherId;
  const ChatTab({super.key, this.initialOtherId});
  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  List<dynamic> _convs = [];
  Map<String, dynamic>? _selected;
  List<dynamic> _msgs = [];
  bool _loading = true;
  bool _sending = false;
  bool _wsConnected = false;
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  String? _myId;
  Map<String, bool> _typing = {};
  Map<String, bool> _online = {};
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final storage = AuthStorage();
    _myId = await storage.getUserId();
    await _loadConvs();
    if (widget.initialOtherId != null && widget.initialOtherId!.isNotEmpty) {
      await _openChatWith(widget.initialOtherId!);
    }
    _connectWs();
  }

  Future<void> _openChatWith(String otherId) async {
    if (!mounted) return;
    final existing = _convs.firstWhere(
      (c) => _getOtherId(c as Map<String, dynamic>) == otherId,
      orElse: () => null,
    );

    if (existing != null) {
      await _selectConv(existing as Map<String, dynamic>);
      return;
    }

    setState(() {
      _selected = {'participantA': _myId ?? '', 'participantB': otherId};
      _msgs = [];
      _loading = false;
    });

    try {
      final api = context.read<ApiClient>();
      final fresh = await api.getMessages(otherId, limit: 60);
      if (!mounted) return;
      setState(() {
        _msgs = fresh;
      });
      await api.markRead(otherId);
    } catch (_) {}
  }

  void _connectWs() {
    // WebSocket connection handled via REST polling fallback on mobile
    // For full WebSocket support add socket_io_client package:
    // socket_io_client: ^2.0.3 in pubspec.yaml
    // This implementation uses REST polling with 5s interval
    _pollMessages();
  }

  Timer? _pollTimer;
  void _pollMessages() {
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_selected != null && mounted) {
        final otherId = _getOtherId(_selected!);
        final api = context.read<ApiClient>();
        try {
          final fresh = await api.getMessages(otherId, limit: 60);
          if (mounted) setState(() => _msgs = fresh);
        } catch (_) {}
      }
    });
  }

  Future<void> _loadConvs() async {
    try {
      final api = context.read<ApiClient>();
      final data = await api.getConversations();
      if (mounted)
        setState(() {
          _convs = data;
          _loading = false;
        });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _getOtherId(Map<String, dynamic> conv) {
    final a = conv['participantA'] as String? ?? '';
    final b = conv['participantB'] as String? ?? '';
    return a == _myId ? b : a;
  }

  Future<void> _selectConv(Map<String, dynamic> conv) async {
    setState(() {
      _selected = conv;
      _msgs = [];
    });
    final api = context.read<ApiClient>();
    final otherId = _getOtherId(conv);
    final msgs = await api.getMessages(otherId, limit: 60);
    if (mounted) {
      setState(() => _msgs = msgs);
      _scrollBottom();
      api.markRead(otherId).catchError((_) => {});
    }
  }

  void _scrollBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final body = _ctrl.text.trim();
    if (body.isEmpty || _selected == null || _sending) return;
    final otherId = _getOtherId(_selected!);
    setState(() {
      _sending = true;
      _ctrl.clear();
    });
    try {
      final api = context.read<ApiClient>();
      final msg = await api.sendMessage(otherId, body);
      if (mounted) {
        setState(() => _msgs = [..._msgs, msg]);
        _scrollBottom();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Send failed: $e'),
            backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    _typingTimer?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_selected != null) return _buildChat();
    return _buildConvList();
  }

  Widget _buildConvList() => Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          backgroundColor: AppColors.dark,
          elevation: 0,
          title: const Text('Messages',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          actions: [
            IconButton(
                icon: const Icon(Icons.refresh, color: Colors.white70),
                onPressed: _loadConvs),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _convs.isEmpty
                ? const Center(
                    child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                        Icon(Icons.chat_bubble_outline,
                            size: 56, color: AppColors.text4),
                        SizedBox(height: 12),
                        Text('No conversations yet',
                            style: TextStyle(
                                color: AppColors.text3,
                                fontWeight: FontWeight.w600,
                                fontSize: 15)),
                        SizedBox(height: 6),
                        Text(
                            'Start by messaging someone from the tasks or jobs screen',
                            style:
                                TextStyle(color: AppColors.text4, fontSize: 12),
                            textAlign: TextAlign.center),
                      ]))
                : ListView.separated(
                    itemCount: _convs.length,
                    separatorBuilder: (_, __) =>
                        const Divider(height: 1, color: AppColors.border),
                    itemBuilder: (_, i) {
                      final c = _convs[i] as Map<String, dynamic>;
                      final otherId = _getOtherId(c);
                      final unread = c['participantA'] == _myId
                          ? (c['unreadCountA'] as int? ?? 0)
                          : (c['unreadCountB'] as int? ?? 0);
                      return ListTile(
                        onTap: () => _selectConv(c),
                        leading: CircleAvatar(
                            backgroundColor: AppColors.primary,
                            child: Text(otherId[0].toUpperCase(),
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800))),
                        title: Text(
                            otherId.length > 12
                                ? '${otherId.substring(0, 12)}…'
                                : otherId,
                            style: TextStyle(
                                fontWeight: unread > 0
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                fontSize: 14)),
                        subtitle: Text(c['lastMessageBody'] ?? 'No messages',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12,
                                color: AppColors.text4,
                                fontWeight: unread > 0
                                    ? FontWeight.w600
                                    : FontWeight.normal)),
                        trailing: unread > 0
                            ? Container(
                                width: 20,
                                height: 20,
                                decoration: const BoxDecoration(
                                    color: AppColors.primary,
                                    shape: BoxShape.circle),
                                child: Center(
                                    child: Text('$unread',
                                        style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800))))
                            : null,
                      );
                    }),
      );

  Widget _buildChat() {
    final otherId = _getOtherId(_selected!);
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        elevation: 0,
        leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => setState(() {
                  _selected = null;
                  _msgs = [];
                })),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(otherId.length > 16 ? '${otherId.substring(0, 16)}…' : otherId,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15)),
          const Text('via REST polling',
              style: TextStyle(color: Colors.white54, fontSize: 10)),
        ]),
      ),
      body: Column(children: [
        Expanded(
            child: ListView.builder(
          controller: _scroll,
          padding: const EdgeInsets.all(14),
          itemCount: _msgs.length,
          itemBuilder: (_, i) {
            final m = _msgs[i] as Map<String, dynamic>;
            final isMine = m['senderId'] == _myId;
            return Align(
              alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                margin: EdgeInsets.only(
                  bottom: 6,
                  left: isMine ? 60 : 0,
                  right: isMine ? 0 : 60,
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  color: isMine ? AppColors.primary : Colors.white,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(14),
                    topRight: const Radius.circular(14),
                    bottomLeft: Radius.circular(isMine ? 14 : 2),
                    bottomRight: Radius.circular(isMine ? 2 : 14),
                  ),
                  border: isMine ? null : Border.all(color: AppColors.border),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withOpacity(0.04), blurRadius: 4)
                  ],
                ),
                child: Text(m['body'] as String? ?? '',
                    style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: isMine ? Colors.white : AppColors.text1)),
              ),
            );
          },
        )),
        Container(
          padding: EdgeInsets.only(
              left: 14,
              right: 14,
              top: 10,
              bottom: MediaQuery.of(context).viewInsets.bottom + 10),
          decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: AppColors.border))),
          child: Row(children: [
            Expanded(
                child: TextField(
              controller: _ctrl,
              maxLines: null,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                  hintText: 'Type a message…',
                  hintStyle: const TextStyle(color: AppColors.text4),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24)),
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
            )),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _send,
              child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                      color: _sending ? AppColors.border : AppColors.primary,
                      shape: BoxShape.circle),
                  child: _sending
                      ? const Center(
                          child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white)))
                      : const Icon(Icons.send_rounded,
                          color: Colors.white, size: 18)),
            ),
          ]),
        ),
      ]),
    );
  }
}
