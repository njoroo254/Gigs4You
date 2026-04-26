import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/api/api_client.dart';
import '../../core/services/notification_service.dart';
import '../../core/storage/auth_storage.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';

// ── View type ─────────────────────────────────────────────────────────────────
enum _ChatType { dm, group }

class ChatTab extends StatefulWidget {
  const ChatTab({super.key});
  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> with SingleTickerProviderStateMixin {
  // ── Conversation list ─────────────────────────────────────────────────────
  List<dynamic> _convs  = [];   // DM conversations
  List<dynamic> _groups = [];   // Group chats
  bool _loading     = true;
  String? _loadError;

  // ── Active chat ────────────────────────────────────────────────────────────
  Map<String, dynamic>? _selected;
  _ChatType _chatType = _ChatType.dm;
  List<dynamic> _msgs = [];

  // ── UI state ───────────────────────────────────────────────────────────────
  bool _sending    = false;
  bool _uploading  = false;
  bool _wsConnected = false;
  bool _isDisposed  = false;
  String? _pendingAttachmentUrl;
  final _ctrl   = TextEditingController();
  final _scroll = ScrollController();
  String? _myId;
  Map<String, bool> _typing = {};
  Map<String, bool> _online = {};
  Timer? _typingTimer;
  Timer? _pollTimer;
  io.Socket? _socket;

  // ── Tab bar (DM / Groups) ──────────────────────────────────────────────────
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _init();
  }

  Future<void> _init() async {
    final storage = AuthStorage();
    _myId = await storage.getUserId();
    await _loadAll();
    _connectWs();
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadConvs(), _loadGroups()]);
  }

  Future<void> _loadConvs() async {
    if (!mounted || _isDisposed) return;
    try {
      final data = await context.read<ApiClient>().getConversations();
      if (mounted && !_isDisposed) setState(() {
        _convs     = data;
        _loading   = false;
        _loadError = null;
      });
    } catch (e) {
      if (mounted && !_isDisposed) setState(() {
        _loading   = false;
        _loadError = 'Could not load messages';
      });
    }
  }

  Future<void> _loadGroups() async {
    if (!mounted || _isDisposed) return;
    try {
      final data = await context.read<ApiClient>().getChatGroups();
      if (mounted && !_isDisposed) setState(() => _groups = data);
    } catch (_) {}
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  Future<void> _connectWs() async {
    final storage = AuthStorage();
    final token = await storage.getToken();
    if (token == null) { _startFallbackPoll(); return; }

    _socket = io.io(
      '${ApiClient.wsBase}/chat',
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(2000)
          .build(),
    );

    _socket!.onConnect((_) {
      if (!mounted) return;
      setState(() => _wsConnected = true);
      _loadConvs();
      if (_selected != null && _chatType == _ChatType.dm) {
        final otherId = _getOtherId(_selected!);
        context.read<ApiClient>().getMessages(otherId, limit: 60).then((fresh) {
          if (mounted && !_isDisposed) setState(() => _msgs = fresh);
        }).catchError((_) {});
      }
    });

    _socket!.onDisconnect((_) {
      if (mounted) setState(() => _wsConnected = false);
    });

    _socket!.on('new_message', (data) {
      if (!mounted) return;
      final msg       = Map<String, dynamic>.from(data as Map);
      final msgId     = msg['id'] as String?;
      final senderId  = msg['senderId'] as String? ?? '';

      if (_selected != null && _chatType == _ChatType.dm) {
        final otherId = _getOtherId(_selected!);
        if (senderId == otherId &&
            !_msgs.any((m) => (m as Map?)?['id'] == msgId)) {
          setState(() => _msgs = [..._msgs, msg]);
          _scrollBottom();
          context.read<ApiClient>().markRead(otherId).catchError((_) => {});
        }
      }

      if (senderId != _myId && senderId.isNotEmpty) {
        final isViewing = _selected != null &&
            _chatType == _ChatType.dm &&
            _getOtherId(_selected!) == senderId;
        if (!isViewing) {
          final conv = _convs.cast<Map<String, dynamic>?>().firstWhere(
            (c) => c != null && _getOtherId(c) == senderId,
            orElse: () => null,
          );
          final senderName = (conv?['otherUser']?['name'] as String?)?.trim().isNotEmpty == true
              ? conv!['otherUser']['name'] as String
              : 'New message';
          final body = (msg['body'] as String?)?.trim() ?? '';
          if (body.isNotEmpty) {
            NotificationService.instance.show(senderName, body, screen: '/chat');
          }
        }
      }
      _loadConvs();
    });

    _socket!.on('new_group_message', (data) {
      if (!mounted) return;
      final msg    = Map<String, dynamic>.from(data as Map);
      final msgId  = msg['id'] as String?;
      final groupId = msg['groupId'] as String? ?? '';

      if (_selected != null &&
          _chatType == _ChatType.group &&
          (_selected!['id'] as String?) == groupId &&
          !_msgs.any((m) => (m as Map?)?['id'] == msgId)) {
        setState(() => _msgs = [..._msgs, msg]);
        _scrollBottom();
      }
      _loadGroups();
    });

    _socket!.on('message_sent', (data) {
      if (!mounted || _selected == null || _chatType != _ChatType.dm) return;
      final msg      = Map<String, dynamic>.from(data as Map);
      final msgId    = msg['id'] as String?;
      final recipient = msg['recipientId'] as String? ?? '';
      final otherId  = _getOtherId(_selected!);
      if (recipient == otherId &&
          !_msgs.any((m) => (m as Map?)?['id'] == msgId)) {
        setState(() => _msgs = [..._msgs, msg]);
        _scrollBottom();
      }
      _loadConvs();
    });

    _socket!.on('user_typing', (data) {
      if (!mounted) return;
      final d = Map<String, dynamic>.from(data as Map);
      setState(() => _typing[d['userId'] as String] = d['isTyping'] as bool? ?? false);
    });

    _socket!.on('presence_update', (data) {
      if (!mounted) return;
      final d = Map<String, dynamic>.from(data as Map);
      setState(() => _online[d['userId'] as String] = d['online'] as bool? ?? false);
    });

    _startFallbackPoll();
  }

  void _startFallbackPoll() {
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      if (!mounted || _isDisposed) return;
      await _loadConvs();
      if (!mounted || _isDisposed || _wsConnected || _selected == null) return;
      if (_chatType == _ChatType.dm) {
        try {
          final fresh = await context.read<ApiClient>()
              .getMessages(_getOtherId(_selected!), limit: 60);
          if (mounted && !_isDisposed) setState(() => _msgs = fresh);
        } catch (_) {}
      } else {
        final groupId = _selected!['id'] as String? ?? '';
        try {
          final fresh = await context.read<ApiClient>().getGroupMessages(groupId);
          if (mounted && !_isDisposed) setState(() => _msgs = fresh);
        } catch (_) {}
      }
    });
  }

  // ── Conversation selection ─────────────────────────────────────────────────
  String _getOtherId(Map<String, dynamic> conv) {
    final a = conv['participantA'] as String? ?? '';
    final b = conv['participantB'] as String? ?? '';
    return a == _myId ? b : a;
  }

  Future<void> _selectDm(Map<String, dynamic> conv) async {
    setState(() { _selected = conv; _chatType = _ChatType.dm; _msgs = []; });
    final otherId = _getOtherId(conv);
    try {
      final msgs = await context.read<ApiClient>().getMessages(otherId, limit: 60);
      if (mounted) {
        setState(() => _msgs = msgs);
        _scrollBottom();
        context.read<ApiClient>().markRead(otherId).catchError((_) => {});
      }
    } catch (_) {}
  }

  Future<void> _selectGroup(Map<String, dynamic> group) async {
    setState(() { _selected = group; _chatType = _ChatType.group; _msgs = []; });
    final groupId = group['id'] as String? ?? '';
    try {
      final msgs = await context.read<ApiClient>().getGroupMessages(groupId);
      if (mounted) {
        setState(() => _msgs = msgs);
        _scrollBottom();
      }
    } catch (_) {}
  }

  void _openNewChat(String otherId, String otherName) {
    final mockConv = {
      'participantA': _myId ?? '',
      'participantB': otherId,
      'otherUser': {'id': otherId, 'name': otherName},
    };
    _selectDm(mockConv);
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  Future<void> _send() async {
    final body       = _ctrl.text.trim();
    final attachment = _pendingAttachmentUrl;
    if (body.isEmpty && attachment == null) return;
    if (_selected == null || _sending) return;
    setState(() { _sending = true; _ctrl.clear(); _pendingAttachmentUrl = null; });
    try {
      final api = context.read<ApiClient>();
      final Map<String, dynamic> msg;
      if (_chatType == _ChatType.group) {
        final groupId = _selected!['id'] as String? ?? '';
        msg = await api.sendGroupMessage(
          groupId,
          body.isEmpty ? '📎 Attachment' : body,
          attachmentUrl: attachment,
        );
      } else {
        final otherId = _getOtherId(_selected!);
        msg = await api.sendMessage(otherId, body.isEmpty ? '📎 Attachment' : body,
          attachmentUrl: attachment);
      }
      if (mounted) {
        if (!_msgs.any((m) => (m as Map?)?['id'] == msg['id'])) {
          setState(() => _msgs = [..._msgs, msg]);
        }
        _scrollBottom();
        _loadConvs();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Send failed: $e'), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _sendTyping(bool isTyping) {
    if (_selected == null || _socket == null || _chatType != _ChatType.dm) return;
    _socket!.emit('typing', {
      'recipientId': _getOtherId(_selected!),
      'isTyping': isTyping,
    });
  }

  // ── Media ──────────────────────────────────────────────────────────────────
  void _openMedia(BuildContext ctx, String url) {
    final isImg = RegExp(r'\.(jpe?g|png|gif|webp)(\?.*)?$', caseSensitive: false).hasMatch(url);
    showDialog(
      context: ctx,
      barrierColor: Colors.black87,
      builder: (_) => GestureDetector(
        onTap: () => Navigator.pop(ctx),
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: Stack(children: [
            Center(
              child: isImg
                ? InteractiveViewer(child: Image.network(url,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, color: Colors.white, size: 64)))
                : Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.insert_drive_file, color: Colors.white, size: 64),
                    const SizedBox(height: 12),
                    Text(url.split('/').last.split('?').first,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      textAlign: TextAlign.center),
                  ]),
            ),
            Positioned(top: 48, right: 16, child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
              onPressed: () => Navigator.pop(ctx))),
          ]),
        ),
      ),
    );
  }

  Future<void> _pickAttachment() async {
    if (_selected == null) return;
    final source = await showModalBottomSheet<ImageSource>(
      context: context, backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(leading: const Icon(Icons.camera_alt), title: const Text('Take photo'),
          onTap: () => Navigator.pop(ctx, ImageSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library), title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
      ])),
    );
    if (source == null || !mounted) return;
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 1280);
    if (picked == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final url = await context.read<ApiClient>().uploadTaskPhoto(picked.path, taskId: 'chat');
      if (url != null && mounted) setState(() => _pendingAttachmentUrl = url);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Upload failed'), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _uploading = false);
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

  @override
  void dispose() {
    _isDisposed = true;
    _tabCtrl.dispose();
    _pollTimer?.cancel();
    _typingTimer?.cancel();
    _socket?.disconnect();
    _socket?.destroy();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ── New chat picker ────────────────────────────────────────────────────────
  Future<void> _showNewChatPicker() async {
    List<dynamic> users = [];
    bool loadingUsers = true;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          if (loadingUsers) {
            context.read<ApiClient>().getChatContacts().then((data) {
              setSheet(() { users = data; loadingUsers = false; });
            }).catchError((_) {
              setSheet(() => loadingUsers = false);
            });
          }
          return DraggableScrollableSheet(
            initialChildSize: 0.6, maxChildSize: 0.9, minChildSize: 0.4,
            expand: false,
            builder: (_, ctrl) => Column(children: [
              Center(child: Container(width: 36, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)))),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(children: [
                  Icon(Icons.person_add_alt_1, color: AppColors.primary),
                  SizedBox(width: 10),
                  Text('Start a new conversation',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ])),
              if (loadingUsers)
                const Expanded(child: Center(child: CircularProgressIndicator()))
              else if (users.isEmpty)
                Expanded(child: Center(
                  child: Text('No team members found', style: TextStyle(color: ctx.appText4))))
              else
                Expanded(child: ListView.separated(
                  controller: ctrl,
                  itemCount: users.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: ctx.appBorderColor),
                  itemBuilder: (_, i) {
                    final contact = users[i] as Map<String, dynamic>;
                    final name   = contact['name'] as String? ?? 'Team member';
                    final role   = contact['role'] as String? ?? '';
                    final userId = contact['id'] as String? ?? '';
                    if (userId.isEmpty || userId == _myId) return const SizedBox.shrink();
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppColors.primary,
                        child: Text(name[0].toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(role, style: TextStyle(fontSize: 12, color: ctx.appText4)),
                      onTap: () { Navigator.pop(ctx); _openNewChat(userId, name); },
                    );
                  },
                )),
            ]),
          );
        },
      ),
    );
  }

  // ── Group profile bottom sheet ─────────────────────────────────────────────
  void _showGroupProfile(Map<String, dynamic> group) {
    final members = (group['members'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final name    = group['name'] as String? ?? 'Group';
    final desc    = group['description'] as String?;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.55, maxChildSize: 0.9, minChildSize: 0.35,
        expand: false,
        builder: (_, ctrl) => Column(children: [
          Center(child: Container(width: 36, height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2)))),
          // Group avatar + name
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.primaryLight],
                begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(16)),
            child: Center(child: Text(name[0].toUpperCase(),
              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)))),
          const SizedBox(height: 10),
          Text(name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ctx.appText1)),
          if (desc != null && desc.isNotEmpty) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(desc,
                style: TextStyle(fontSize: 13, color: ctx.appText3),
                textAlign: TextAlign.center)),
          ],
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Text('${members.length} member${members.length == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ctx.appText2)),
            ])),
          const Divider(height: 20),
          Expanded(
            child: members.isEmpty
              ? Center(child: Text('No members', style: TextStyle(color: ctx.appText4)))
              : ListView.separated(
                  controller: ctrl,
                  itemCount: members.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: ctx.appBorderColor),
                  itemBuilder: (_, i) {
                    final m    = members[i];
                    final mName = m['name'] as String? ?? m['user']?['name'] as String? ?? 'Member';
                    final role  = m['role'] as String? ?? m['user']?['role'] as String? ?? '';
                    final isMe  = (m['id'] ?? m['userId']) == _myId;
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppColors.primary.withValues(alpha: isMe ? 1.0 : 0.6),
                        child: Text(mName[0].toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                      title: Text(isMe ? '$mName (you)' : mName,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: role.isNotEmpty
                        ? Text(role, style: TextStyle(fontSize: 12, color: ctx.appText4))
                        : null,
                    );
                  }),
          ),
        ]),
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    if (_selected != null) return _buildChat();
    return _buildConvList();
  }

  Widget _buildConvList() => Scaffold(
    backgroundColor: context.appSurfaceColor,
    appBar: AppBar(
      backgroundColor: AppColors.dark,
      elevation: 0,
      title: Row(children: [
        const Text('Messages',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
        const SizedBox(width: 8),
        Container(width: 8, height: 8,
          decoration: BoxDecoration(
            color: _wsConnected ? AppColors.primary : Colors.grey,
            shape: BoxShape.circle)),
      ]),
      actions: [
        Builder(builder: (ctx) {
          final isDark = ctx.watch<ThemeProvider>().isDark;
          return IconButton(
            padding: EdgeInsets.zero,
            iconSize: 18,
            tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
            icon: Icon(isDark ? Icons.wb_sunny_rounded : Icons.nightlight_round,
              color: Colors.white.withValues(alpha: 0.85), size: 18),
            onPressed: () => ctx.read<ThemeProvider>().toggle(),
          );
        }),
        const SizedBox(width: 4),
        IconButton(
          icon: const Icon(Icons.edit_rounded, color: Colors.white70),
          tooltip: 'New message',
          onPressed: _showNewChatPicker),
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white70),
          onPressed: _loadAll),
      ],
      bottom: TabBar(
        controller: _tabCtrl,
        indicatorColor: AppColors.primary,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white54,
        labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        tabs: [
          Tab(text: 'Direct (${_convs.length})'),
          Tab(text: 'Groups (${_groups.length})'),
        ],
      ),
    ),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : _loadError != null
        ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.wifi_off_rounded, size: 52, color: context.appText4),
            const SizedBox(height: 12),
            Text(_loadError!, style: TextStyle(color: context.appText3, fontSize: 14)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: () {
              setState(() { _loading = true; _loadError = null; });
              _loadAll();
            }, child: const Text('Retry')),
          ]))
        : TabBarView(
            controller: _tabCtrl,
            children: [_buildDmList(), _buildGroupList()],
          ),
  );

  Widget _buildDmList() {
    if (_convs.isEmpty) {
      return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.chat_bubble_outline, size: 56, color: context.appText4),
        const SizedBox(height: 12),
        Text('No conversations yet',
          style: TextStyle(color: context.appText3, fontWeight: FontWeight.w600, fontSize: 15)),
        const SizedBox(height: 6),
        Text('Tap the pencil icon to start a conversation',
          style: TextStyle(color: context.appText4, fontSize: 12), textAlign: TextAlign.center),
        const SizedBox(height: 20),
        ElevatedButton.icon(
          icon: const Icon(Icons.edit_rounded, size: 16), label: const Text('New Message'),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
          onPressed: _showNewChatPicker),
      ]));
    }
    return ListView.separated(
      itemCount: _convs.length,
      separatorBuilder: (_, __) => Divider(height: 1, color: context.appBorderColor),
      itemBuilder: (_, i) {
        final c        = _convs[i] as Map<String, dynamic>;
        final otherId  = _getOtherId(c);
        final unread   = c['participantA'] == _myId
            ? (c['unreadCountA'] as int? ?? 0)
            : (c['unreadCountB'] as int? ?? 0);
        final isOnline = _online[otherId] ?? false;
        final displayName = (c['otherUser']?['name'] as String?)?.trim().isNotEmpty == true
            ? c['otherUser']['name'] as String
            : otherId.length > 12 ? '${otherId.substring(0, 12)}…' : otherId;
        return ListTile(
          onTap: () => _selectDm(c),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Stack(clipBehavior: Clip.none, children: [
            CircleAvatar(
              backgroundColor: AppColors.primary,
              child: Text(displayName[0].toUpperCase(),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
            if (isOnline)
              Positioned(right: -2, bottom: -2, child: Container(
                width: 11, height: 11,
                decoration: BoxDecoration(
                  color: AppColors.primary, shape: BoxShape.circle,
                  border: Border.all(color: context.appSurfaceColor, width: 2)))),
          ]),
          title: Text(displayName, style: TextStyle(
            fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w500, fontSize: 14)),
          subtitle: Text(c['lastMessageBody'] as String? ?? 'No messages yet',
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: context.appText4,
              fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.normal)),
          trailing: unread > 0
            ? Container(width: 20, height: 20,
                decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                child: Center(child: Text('$unread',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800))))
            : null,
        );
      });
  }

  Widget _buildGroupList() {
    if (_groups.isEmpty) {
      return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.group_outlined, size: 56, color: context.appText4),
        const SizedBox(height: 12),
        Text('No group chats', style: TextStyle(color: context.appText3, fontWeight: FontWeight.w600, fontSize: 15)),
        const SizedBox(height: 6),
        Text('Groups are created by your organisation admin',
          style: TextStyle(color: context.appText4, fontSize: 12), textAlign: TextAlign.center),
      ]));
    }
    return ListView.separated(
      itemCount: _groups.length,
      separatorBuilder: (_, __) => Divider(height: 1, color: context.appBorderColor),
      itemBuilder: (_, i) {
        final g         = _groups[i] as Map<String, dynamic>;
        final groupName = g['name'] as String? ?? 'Group';
        final lastMsg   = g['lastMessage']?['body'] as String? ?? g['lastMessageBody'] as String? ?? 'No messages yet';
        final memberCount = (g['members'] as List?)?.length ?? g['memberCount'] as int? ?? 0;
        return ListTile(
          onTap: () => _selectGroup(g),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.primaryLight],
                begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(13)),
            child: Center(child: Text(groupName[0].toUpperCase(),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)))),
          title: Text(groupName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          subtitle: Text(lastMsg, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: context.appText4)),
          trailing: Text('$memberCount members',
            style: TextStyle(fontSize: 10, color: context.appText4)),
        );
      });
  }

  Widget _buildChat() {
    final isGroup = _chatType == _ChatType.group;

    final chatName = isGroup
      ? (_selected!['name'] as String? ?? 'Group')
      : ((_selected!['otherUser']?['name'] as String?)?.trim().isNotEmpty == true
          ? _selected!['otherUser']['name'] as String
          : 'Chat');

    final otherId  = isGroup ? '' : _getOtherId(_selected!);
    final isTyping = !isGroup && (_typing[otherId] ?? false);

    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => setState(() { _selected = null; _msgs = []; })),
        title: InkWell(
          onTap: isGroup ? () => _showGroupProfile(_selected!) : null,
          child: Row(children: [
            isGroup
              ? Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppColors.primary, AppColors.primaryLight],
                      begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(9)),
                  child: Center(child: Text(chatName[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13))))
              : CircleAvatar(radius: 16, backgroundColor: AppColors.primary,
                  child: Text(chatName[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13))),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(chatName, style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                if (isGroup) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.info_outline_rounded, color: Colors.white38, size: 14),
                ],
              ]),
              if (isGroup)
                Text(
                  '${(_selected!['members'] as List?)?.length ?? (_selected!['memberCount'] ?? 0)} members — tap to view',
                  style: const TextStyle(color: Colors.white60, fontSize: 11))
              else if (isTyping)
                const Text('typing…', style: TextStyle(color: Colors.white60, fontSize: 11))
              else if (_online[otherId] == true)
                const Text('online', style: TextStyle(color: Colors.greenAccent, fontSize: 11))
              else
                const Text('offline', style: TextStyle(color: Colors.white38, fontSize: 11)),
            ]),
          ]),
        ),
      ),
      body: Column(children: [
        Expanded(child: _msgs.isEmpty
          ? Center(child: Text('No messages yet — say hello!',
              style: TextStyle(color: context.appText4, fontSize: 13)))
          : ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              itemCount: _msgs.length,
              itemBuilder: (_, i) {
                final m      = _msgs[i] as Map<String, dynamic>;
                final sender = m['senderId'] as String? ?? m['sender']?['id'] as String? ?? '';
                final isMine = sender == _myId;
                final senderName = isGroup && !isMine
                    ? (m['sender']?['name'] as String? ?? '') : null;
                final time   = m['createdAt'] != null
                    ? _fmtTime(DateTime.tryParse(m['createdAt'].toString())) : null;
                final att    = m['attachmentUrl'] as String?;
                final isImg  = att != null &&
                    RegExp(r'\.(jpe?g|png|gif|webp)(\?.*)?$', caseSensitive: false).hasMatch(att);
                final body   = m['body'] as String? ?? '';
                final showBody = body.isNotEmpty && body != '📎 Attachment';
                return Align(
                  alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Column(
                    crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                    children: [
                      if (senderName != null && senderName.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 4, bottom: 2),
                          child: Text(senderName,
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.primary))),
                      Container(
                        margin: EdgeInsets.only(
                          bottom: 2,
                          left: isMine ? 60 : 0,
                          right: isMine ? 0 : 60),
                        padding: att != null && !showBody
                          ? const EdgeInsets.all(4)
                          : const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: isMine ? AppColors.primary : context.appCardColor,
                          borderRadius: BorderRadius.only(
                            topLeft:    const Radius.circular(14),
                            topRight:   const Radius.circular(14),
                            bottomLeft: Radius.circular(isMine ? 14 : 2),
                            bottomRight: Radius.circular(isMine ? 2 : 14)),
                          border: isMine ? null : Border.all(color: context.appBorderColor),
                          boxShadow: [BoxShadow(
                            color: Colors.black.withValues(alpha: 0.04), blurRadius: 4)],
                        ),
                        child: Column(
                          crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                          children: [
                            if (att != null && isImg)
                              GestureDetector(
                                onTap: () => _openMedia(context, att),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.network(att, width: 200, fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48, color: Colors.grey)))),
                            if (att != null && !isImg)
                              GestureDetector(
                                onTap: () => _openMedia(context, att),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: isMine ? Colors.white.withValues(alpha: 0.15) : context.appSurfaceColor,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: context.appBorderColor)),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    const Icon(Icons.insert_drive_file, size: 28, color: AppColors.primary),
                                    const SizedBox(width: 8),
                                    Flexible(child: Text(att.split('/').last.split('?').first,
                                      style: TextStyle(fontSize: 12, color: isMine ? Colors.white : context.appText1),
                                      overflow: TextOverflow.ellipsis)),
                                  ]))),
                            if (showBody) ...[
                              if (att != null) const SizedBox(height: 4),
                              Text(body, style: TextStyle(
                                fontSize: 13, height: 1.4,
                                color: isMine ? Colors.white : context.appText1)),
                            ],
                          ],
                        ),
                      ),
                      if (time != null)
                        Padding(
                          padding: EdgeInsets.only(
                            bottom: 6,
                            left: isMine ? 0 : 4,
                            right: isMine ? 4 : 0),
                          child: Text(time,
                            style: TextStyle(fontSize: 10, color: context.appText4))),
                    ],
                  ),
                );
              })),
        Column(children: [
          if (_pendingAttachmentUrl != null)
            Container(
              color: context.appSurfaceColor,
              padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
              child: Row(children: [
                GestureDetector(
                  onTap: () => _openMedia(context, _pendingAttachmentUrl!),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.network(_pendingAttachmentUrl!, width: 48, height: 48, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Icon(Icons.insert_drive_file, size: 36, color: AppColors.primary)))),
                const SizedBox(width: 8),
                Expanded(child: Text(_pendingAttachmentUrl!.split('/').last.split('?').first,
                  style: TextStyle(fontSize: 12, color: context.appText3),
                  overflow: TextOverflow.ellipsis)),
                IconButton(
                  icon: Icon(Icons.close, size: 18, color: context.appText4),
                  onPressed: () => setState(() => _pendingAttachmentUrl = null)),
              ]),
            ),
          Container(
            padding: EdgeInsets.only(
              left: 8, right: 8, top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom + 8),
            decoration: BoxDecoration(
              color: context.appNavBarColor,
              border: Border(top: BorderSide(color: context.appBorderColor))),
            child: Row(children: [
              _uploading
                ? const SizedBox(width: 36, height: 36,
                    child: Center(child: SizedBox(width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))))
                : IconButton(
                    icon: Icon(Icons.attach_file_rounded, color: context.appText3, size: 22),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    onPressed: _pickAttachment),
              const SizedBox(width: 4),
              Expanded(child: TextField(
                controller: _ctrl,
                maxLines: null,
                keyboardType: TextInputType.multiline,
                textInputAction: TextInputAction.newline,
                style: const TextStyle(fontSize: 13),
                onChanged: (v) {
                  if (v.isNotEmpty && !isGroup) {
                    _sendTyping(true);
                    _typingTimer?.cancel();
                    _typingTimer = Timer(const Duration(seconds: 2), () => _sendTyping(false));
                  }
                },
                decoration: InputDecoration(
                  hintText: isGroup ? 'Message the group…' : 'Type a message…',
                  hintStyle: TextStyle(color: context.appText4),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
              )),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _send,
                child: Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: (_sending || (_ctrl.text.isEmpty && _pendingAttachmentUrl == null))
                      ? context.appBorderColor : AppColors.primary,
                    shape: BoxShape.circle),
                  child: _sending
                    ? const Center(child: SizedBox(width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                    : const Icon(Icons.send_rounded, color: Colors.white, size: 18)),
              ),
            ]),
          ),
        ]),
      ]),
    );
  }

  String _fmtTime(DateTime? dt) {
    if (dt == null) return '';
    final now   = DateTime.now();
    final local = dt.toLocal();
    if (local.day == now.day && local.month == now.month && local.year == now.year) {
      return '${local.hour.toString().padLeft(2,'0')}:${local.minute.toString().padLeft(2,'0')}';
    }
    return '${local.day}/${local.month} ${local.hour.toString().padLeft(2,'0')}:${local.minute.toString().padLeft(2,'0')}';
  }
}
