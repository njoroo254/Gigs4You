import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

// ── Data model ────────────────────────────────────────────────────────────────

enum _Sender { user, cathy }

class _Message {
  final _Sender sender;
  final String text;
  final DateTime at;
  _Message(this.sender, this.text) : at = DateTime.now();
}

// ── Quick-start prompts shown before the conversation begins ──────────────────

const _quickPrompts = [
  'What jobs match my skills?',
  'Show my wallet balance',
  'How do I improve my profile?',
  'What are today\'s top opportunities?',
];

// ── Screen ────────────────────────────────────────────────────────────────────

class CathyScreen extends StatefulWidget {
  const CathyScreen({super.key});

  @override
  State<CathyScreen> createState() => _CathyScreenState();
}

enum _IdlePhase { active, askingSatisfied, warning }

class _CathyScreenState extends State<CathyScreen> {
  final _msgCtrl   = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _conversationId = _generateId();

  final List<_Message> _messages = [];
  bool _thinking = false;

  Timer? _inactivityTimer;
  _IdlePhase _idlePhase = _IdlePhase.active;

  // Phase 1: 90 s of user silence → ask if satisfied
  // Phase 2: 30 s more → warn then close
  static const _kIdleAskSeconds  = 90;
  static const _kIdleWarnSeconds = 30;

  static String _generateId() {
    final r = Random();
    return List.generate(12, (_) => r.nextInt(36).toRadixString(36)).join();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _addCathy("Hi! I'm **Cathy**, your Gigs4You assistant. How can I help you today?");
    });
  }

  @override
  void dispose() {
    _inactivityTimer?.cancel();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  /// Start (or restart) the inactivity countdown after every Cathy response.
  /// Cancelled when the user sends a message.
  void _startInactivityTimer() {
    _inactivityTimer?.cancel();
    _idlePhase = _IdlePhase.active;
    _inactivityTimer = Timer(const Duration(seconds: _kIdleAskSeconds), _onIdlePhaseOne);
  }

  void _onIdlePhaseOne() {
    if (!mounted) return;
    _idlePhase = _IdlePhase.askingSatisfied;
    _addCathyRaw("Are you all set? Let me know if there's anything else — or I'll close our chat in 30 seconds.");
    _inactivityTimer = Timer(const Duration(seconds: _kIdleWarnSeconds), _onIdlePhaseTwo);
  }

  void _onIdlePhaseTwo() {
    if (!mounted) return;
    _idlePhase = _IdlePhase.warning;
    _addCathyRaw("Closing our chat now. Tap **Ask Cathy** anytime to come back!");
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) Navigator.pop(context);
    });
  }

  /// Adds a Cathy message without restarting the inactivity timer.
  void _addCathyRaw(String text) {
    setState(() => _messages.add(_Message(_Sender.cathy, text)));
    _scrollToBottom();
  }

  void _addCathy(String text) {
    setState(() => _messages.add(_Message(_Sender.cathy, text)));
    _scrollToBottom();
    _startInactivityTimer();
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

  Future<void> _send([String? override]) async {
    final text = (override ?? _msgCtrl.text).trim();
    if (text.isEmpty || _thinking) return;
    // User is active — cancel any pending auto-close and restart the idle clock
    _inactivityTimer?.cancel();
    _idlePhase = _IdlePhase.active;
    _msgCtrl.clear();

    setState(() {
      _messages.add(_Message(_Sender.user, text));
      _thinking = true;
    });
    _scrollToBottom();

    try {
      final api = context.read<ApiClient>();
      final reply = await api.chatWithCathy(_conversationId, text);
      if (mounted) _addCathy(reply);
    } catch (e) {
      if (mounted) {
        _addCathy("Sorry, I'm having trouble connecting right now. Please check your internet and try again.");
      }
    } finally {
      if (mounted) setState(() => _thinking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Center(
                child: Text('C', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Cathy', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text1)),
                Text(
                  _thinking ? 'Thinking…' : 'AI Assistant',
                  style: TextStyle(
                    fontSize: 11,
                    color: _thinking ? AppColors.primary : AppColors.text4,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // ── Message list ─────────────────────────────────────────────────
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              itemCount: _messages.length + (_thinking ? 1 : 0),
              itemBuilder: (_, i) {
                // Typing indicator
                if (i == _messages.length && _thinking) {
                  return const _TypingBubble();
                }
                final msg = _messages[i];
                return _MessageBubble(msg: msg);
              },
            ),
          ),

          // ── Satisfaction actions (shown when Cathy asks if user is done) ─
          if (_idlePhase == _IdlePhase.askingSatisfied)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Row(children: [
                Expanded(child: OutlinedButton.icon(
                  icon: const Icon(Icons.check_rounded, size: 16),
                  label: const Text('Yes, close chat', style: TextStyle(fontSize: 13)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.success,
                    side: const BorderSide(color: AppColors.success),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onPressed: () {
                    _inactivityTimer?.cancel();
                    Navigator.pop(context);
                  },
                )),
                const SizedBox(width: 10),
                Expanded(child: ElevatedButton.icon(
                  icon: const Icon(Icons.chat_bubble_outline_rounded, size: 16),
                  label: const Text('No, continue', style: TextStyle(fontSize: 13)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onPressed: () {
                    _inactivityTimer?.cancel();
                    setState(() => _idlePhase = _IdlePhase.active);
                    _startInactivityTimer();
                  },
                )),
              ]),
            ),

          // ── Quick prompts (only before first user message) ────────────────
          if (_idlePhase == _IdlePhase.active &&
              _messages.where((m) => m.sender == _Sender.user).isEmpty)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _quickPrompts.map((p) => _QuickChip(
                    label: p,
                    onTap: () => _send(p),
                  )).toList(),
                ),
              ),
            ),

          // ── Input bar ────────────────────────────────────────────────────
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, -2))],
            ),
            padding: EdgeInsets.fromLTRB(12, 10, 12, MediaQuery.of(context).padding.bottom + 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: 'Ask Cathy anything…',
                      hintStyle: const TextStyle(color: AppColors.text4, fontSize: 14),
                      filled: true,
                      fillColor: AppColors.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => _send(),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 3))],
                    ),
                    child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Message bubble ────────────────────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  final _Message msg;
  const _MessageBubble({required this.msg});

  bool get _isUser => msg.sender == _Sender.user;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: _isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!_isUser) ...[
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text('C', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _isUser ? AppColors.primary : Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft:     const Radius.circular(16),
                  topRight:    const Radius.circular(16),
                  bottomLeft:  Radius.circular(_isUser ? 16 : 4),
                  bottomRight: Radius.circular(_isUser ? 4 : 16),
                ),
                border: _isUser ? null : Border.all(color: AppColors.border, width: 0.5),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
              ),
              child: _SimpleMarkdown(
                text: msg.text,
                isUser: _isUser,
              ),
            ),
          ),
          if (_isUser) const SizedBox(width: 8),
        ],
      ),
    );
  }
}

// ── Typing indicator ──────────────────────────────────────────────────────────

class _TypingBubble extends StatefulWidget {
  const _TypingBubble();
  @override State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _dot1, _dot2, _dot3;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();
    _dot1 = Tween(begin: 0.3, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.0, 0.6)));
    _dot2 = Tween(begin: 0.3, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.2, 0.8)));
    _dot3 = Tween(begin: 0.3, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 1.0)));
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)]),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(child: Text('C', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12))),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16), topRight: Radius.circular(16), bottomRight: Radius.circular(16), bottomLeft: Radius.circular(4),
              ),
              border: Border.all(color: AppColors.border, width: 0.5),
            ),
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (_, __) => Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Dot(opacity: _dot1.value),
                  const SizedBox(width: 4),
                  _Dot(opacity: _dot2.value),
                  const SizedBox(width: 4),
                  _Dot(opacity: _dot3.value),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  final double opacity;
  const _Dot({required this.opacity});
  @override
  Widget build(BuildContext context) => Opacity(
    opacity: opacity,
    child: Container(
      width: 7, height: 7,
      decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
    ),
  );
}

// ── Quick prompt chip ─────────────────────────────────────────────────────────

class _QuickChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _QuickChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.primaryPale,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
    ),
  );
}

// ── Minimal inline Markdown renderer ─────────────────────────────────────────
// Handles **bold**, line breaks, and bullet lines (- item). No external packages.

class _SimpleMarkdown extends StatelessWidget {
  final String text;
  final bool isUser;
  const _SimpleMarkdown({required this.text, required this.isUser});

  @override
  Widget build(BuildContext context) {
    final baseColor = isUser ? Colors.white : AppColors.text1;
    final mutedColor = isUser ? Colors.white70 : AppColors.text3;

    final lines = text.split('\n');
    final widgets = <Widget>[];

    for (int i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (line.trim().isEmpty) {
        widgets.add(const SizedBox(height: 4));
        continue;
      }
      final isBullet = line.trimLeft().startsWith('- ') || line.trimLeft().startsWith('• ');
      final displayLine = isBullet ? line.trimLeft().substring(2) : line;

      if (isBullet) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('• ', style: TextStyle(color: isUser ? Colors.white70 : AppColors.primary, fontSize: 13, fontWeight: FontWeight.w700)),
              Expanded(child: _buildRichText(displayLine, baseColor, mutedColor)),
            ],
          ),
        ));
      } else {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: _buildRichText(displayLine, baseColor, mutedColor),
        ));
      }
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }

  Widget _buildRichText(String line, Color base, Color muted) {
    // Parse **bold** spans
    final spans = <InlineSpan>[];
    final re = RegExp(r'\*\*(.+?)\*\*');
    int last = 0;

    for (final m in re.allMatches(line)) {
      if (m.start > last) {
        spans.add(TextSpan(text: line.substring(last, m.start)));
      }
      spans.add(TextSpan(text: m.group(1), style: const TextStyle(fontWeight: FontWeight.w700)));
      last = m.end;
    }
    if (last < line.length) spans.add(TextSpan(text: line.substring(last)));

    return RichText(
      text: TextSpan(
        style: TextStyle(fontSize: 14, color: base, height: 1.45, fontFamily: 'DM Sans'),
        children: spans,
      ),
    );
  }
}
