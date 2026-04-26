import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/storage/auth_storage.dart';

/// Cathy — Gigs4You AI Assistant chat bubble.
///
/// Self-contained: loads JWT + user context from [AuthStorage].
/// Sends requests to the AI service with proper Bearer auth.
/// Response format: { "data": { "reply": "..." } }
class AIChatWidget extends StatefulWidget {
  final String aiUrl;

  const AIChatWidget({
    super.key,
    this.aiUrl = 'http://10.0.2.2:8001',
  });

  @override
  State<AIChatWidget> createState() => _AIChatWidgetState();
}

class _AIChatWidgetState extends State<AIChatWidget>
    with SingleTickerProviderStateMixin {
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _scrollCtrl  = ScrollController();
  final AuthStorage _storage          = AuthStorage();
  final List<_ChatMsg> _messages      = [];

  bool    _isLoading  = false;
  bool    _isExpanded = false;
  String? _token;
  String? _convId;

  late AnimationController _pulseCtrl;
  late Animation<double>   _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _pulseAnim = Tween(begin: 1.0, end: 1.06).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
    _loadAuth();
  }

  Future<void> _loadAuth() async {
    final token  = await _storage.getToken();
    final userId = await _storage.getUserId();
    if (!mounted) return;
    setState(() {
      _token  = token;
      _convId = 'mobile-${userId ?? 'anon'}';
    });
    if (_messages.isEmpty) _addWelcome();
  }

  void _addWelcome() {
    setState(() {
      _messages.add(_ChatMsg(
        text: "Hi! I'm Cathy, your Gigs4You AI assistant. I can help with tasks, jobs, payments, and anything on the platform. What can I do for you?",
        isUser: false,
        timestamp: DateTime.now(),
      ));
    });
  }

  Future<void> _send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    setState(() {
      _messages.add(_ChatMsg(text: trimmed, isUser: true, timestamp: DateTime.now()));
      _isLoading = true;
    });
    _msgCtrl.clear();
    _scrollToBottom();

    if (_token == null) {
      _addError('Not authenticated. Please log out and back in.');
      return;
    }

    try {
      final res = await http.post(
        Uri.parse('${widget.aiUrl}/chat/assist'),
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({
          'conversation_id': _convId ?? 'mobile-anon',
          'message':         trimmed,
          'platform':        'mobile',
          'user_context':    <String, String>{},
        }),
      ).timeout(const Duration(seconds: 30));

      if (res.statusCode == 200) {
        final body   = jsonDecode(res.body) as Map<String, dynamic>;
        final data   = body['data']  as Map<String, dynamic>?;
        final reply  = data?['reply'] as String?
                    ?? body['response'] as String?
                    ?? "Sorry, I couldn't get a response.";
        setState(() => _messages.add(_ChatMsg(
          text: reply, isUser: false, timestamp: DateTime.now(),
        )));
      } else if (res.statusCode == 401) {
        _addError('Session expired. Please log out and back in.');
      } else {
        _addError('Service returned ${res.statusCode}. Please try again.');
      }
    } catch (e) {
      _addError('Could not reach Cathy right now. Check your connection.');
    } finally {
      setState(() => _isLoading = false);
      _scrollToBottom();
    }
  }

  void _addError(String msg) {
    setState(() => _messages.add(_ChatMsg(text: msg, isUser: false, timestamp: DateTime.now(), isError: true)));
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (!_isExpanded) return _buildPill();
    return _buildExpandedPanel(context);
  }

  // Collapsed "Ask Cathy" pill
  Widget _buildPill() {
    return ScaleTransition(
      scale: _pulseAnim,
      child: GestureDetector(
        onTap: () => setState(() => _isExpanded = true),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF1B6B3A), Color(0xFF2D9E5F)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF1B6B3A).withValues(alpha: 0.45),
                blurRadius: 14,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.smart_toy_rounded, color: Colors.white, size: 17),
              ),
              const SizedBox(width: 8),
              const Text(
                'Ask Cathy',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(width: 4),
              const Text('✨', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }

  // Expanded chat panel (modal-like bottom sheet feel)
  Widget _buildExpandedPanel(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Material(
      elevation: 16,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: SizedBox(
        width:  size.width  * 0.93,
        height: size.height * 0.72,
        child: Column(
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 10, 14),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF1B6B3A), Color(0xFF2D9E5F)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.smart_toy_rounded, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Cathy', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
                        Text('AI Assistant · Gigs4You', style: TextStyle(color: Colors.white70, fontSize: 11)),
                      ],
                    ),
                  ),
                  // New conversation button
                  IconButton(
                    onPressed: () => setState(() {
                      _messages.clear();
                      _addWelcome();
                    }),
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white70, size: 20),
                    tooltip: 'New conversation',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: () => setState(() => _isExpanded = false),
                    icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 26),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),

            // Messages
            Expanded(
              child: Container(
                color: const Color(0xFFF8F9FA),
                child: ListView.builder(
                  controller: _scrollCtrl,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  itemCount: _messages.length + (_isLoading ? 1 : 0),
                  itemBuilder: (ctx, i) {
                    if (i == _messages.length && _isLoading) return _buildTyping();
                    return _buildBubble(_messages[i]);
                  },
                ),
              ),
            ),

            // Input
            Container(
              padding: const EdgeInsets.fromLTRB(14, 10, 10, 14),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Color(0xFFE8E8E8))),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _msgCtrl,
                      decoration: InputDecoration(
                        hintText: 'Ask me anything...',
                        hintStyle: const TextStyle(color: Color(0xFFADADAD), fontSize: 14),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                      ),
                      style: const TextStyle(fontSize: 14),
                      maxLines: 4,
                      minLines: 1,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _send,
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: _isLoading ? null : () => _send(_msgCtrl.text),
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF1B6B3A), Color(0xFF2D9E5F)],
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF1B6B3A).withValues(alpha: 0.3),
                            blurRadius: 8, offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: _isLoading
                          ? const Padding(
                              padding: EdgeInsets.all(11),
                              child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)),
                            )
                          : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBubble(_ChatMsg msg) {
    final isUser = msg.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          color: isUser
              ? const Color(0xFF1B6B3A)
              : msg.isError
                  ? const Color(0xFFFFF3F3)
                  : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft:     Radius.circular(isUser ? 18 : 4),
            topRight:    Radius.circular(isUser ? 4 : 18),
            bottomLeft:  const Radius.circular(18),
            bottomRight: const Radius.circular(18),
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2)),
          ],
          border: msg.isError ? Border.all(color: const Color(0xFFFFCDD2)) : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser && !msg.isError)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('Cathy', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF1B6B3A))),
              ),
            Text(
              msg.text,
              style: TextStyle(
                color: isUser ? Colors.white : msg.isError ? const Color(0xFFB71C1C) : const Color(0xFF1A1A1A),
                fontSize: 14,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _fmt(msg.timestamp),
              style: TextStyle(
                fontSize: 10,
                color: isUser ? Colors.white60 : const Color(0xFFADADAD),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTyping() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.only(
            topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(18),
          ),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Cathy is typing', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            const SizedBox(width: 8),
            ...List.generate(3, (i) => _Dot(delay: i * 200)),
          ],
        ),
      ),
    );
  }

  String _fmt(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    _pulseCtrl.dispose();
    super.dispose();
  }
}

// ── Animated typing dot ──────────────────────────────────────────────────────
class _Dot extends StatefulWidget {
  final int delay;
  const _Dot({required this.delay});
  @override State<_Dot> createState() => _DotState();
}
class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double>   _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _anim = Tween(begin: 0.0, end: -6.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ctrl.repeat(reverse: true);
    });
  }

  @override
  Widget build(BuildContext ctx) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Transform.translate(
      offset: Offset(0, _anim.value),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        width: 5, height: 5,
        decoration: BoxDecoration(color: Colors.grey.shade400, shape: BoxShape.circle),
      ),
    ),
  );

  @override void dispose() { _ctrl.dispose(); super.dispose(); }
}

// ── Chat message model ───────────────────────────────────────────────────────
class _ChatMsg {
  final String   text;
  final bool     isUser;
  final DateTime timestamp;
  final bool     isError;

  const _ChatMsg({
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.isError = false,
  });
}
