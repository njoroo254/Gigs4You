import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';

class AgentWalletTab extends StatefulWidget {
  const AgentWalletTab({super.key});
  @override
  State<AgentWalletTab> createState() => _AgentWalletTabState();
}

class _AgentWalletTabState extends State<AgentWalletTab> {
  Map<String, dynamic> _wallet = {};
  List<dynamic> _txs = [];
  bool _loading = true;
  bool _withdrawing = false;

  final _phoneCtrl  = TextEditingController();
  final _amountCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<ApiClient>();
    final results = await Future.wait([api.getWallet(), api.getTransactions()]);
    if (mounted) {
      setState(() {
        _wallet  = results[0] as Map<String, dynamic>;
        _txs     = results[1] as List<dynamic>;
        _loading = false;
      });
    }
  }

  Future<void> _withdraw() async {
    final amount = double.tryParse(_amountCtrl.text.trim());
    final phone  = _phoneCtrl.text.trim();
    if (phone.isEmpty) { _snack('Enter your M-Pesa phone number'); return; }
    if (amount == null || amount < 10) { _snack('Minimum withdrawal is KES 10'); return; }
    final balance = double.tryParse(_wallet['balance']?.toString() ?? '0') ?? 0;
    if (amount > balance) { _snack('Insufficient balance'); return; }

    setState(() => _withdrawing = true);
    try {
      final api = context.read<ApiClient>();
      await api.requestWithdrawal(amount, phone);
      _snack('Withdrawal request submitted. Funds will be sent shortly.', ok: true);
      _amountCtrl.clear();
      await _load();
    } catch (e) {
      _snack(_extractError(e));
    } finally {
      if (mounted) setState(() => _withdrawing = false);
    }
  }

  void _snack(String msg, {bool ok = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: ok ? AppColors.primary : AppColors.danger,
      behavior: SnackBarBehavior.floating,
    ));
  }

  String _extractError(dynamic e) {
    try {
      final data = (e as dynamic).response?.data;
      if (data is Map) return data['message']?.toString() ?? 'Request failed';
    } catch (_) {}
    return 'Request failed';
  }

  String _fmtAmount(dynamic v) {
    final n = double.tryParse(v?.toString() ?? '0') ?? 0;
    return 'KES ${n.toStringAsFixed(2)}';
  }

  String _fmtDate(String? d) {
    if (d == null) return '';
    try {
      final dt = DateTime.parse(d).toLocal();
      return '${dt.day} ${_month(dt.month)} ${dt.year}';
    } catch (_) { return d; }
  }

  String _month(int m) => const ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];

  Color _txColor(String? type) {
    if (type == 'credit') return AppColors.primary;
    if (type == 'debit')  return AppColors.danger;
    return AppColors.text3;
  }

  String _txSign(String? type) => type == 'debit' ? '-' : '+';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      appBar: AppBar(
        backgroundColor: context.appNavBarColor,
        elevation: 0,
        title: const Text('My Wallet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        actions: [
          Builder(builder: (ctx) {
            final isDark = ctx.watch<ThemeProvider>().isDark;
            return IconButton(
              tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
              icon: Icon(isDark ? Icons.wb_sunny_rounded : Icons.nightlight_round, size: 20),
              onPressed: () => ctx.read<ThemeProvider>().toggle(),
            );
          }),
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── Balance card ─────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(children: [
                          Icon(Icons.account_balance_wallet_rounded, color: Colors.white70, size: 18),
                          SizedBox(width: 6),
                          Text('Available Balance', style: TextStyle(color: Colors.white70, fontSize: 13)),
                        ]),
                        const SizedBox(height: 8),
                        Text(_fmtAmount(_wallet['balance']),
                            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
                        if ((_wallet['pendingBalance'] ?? 0).toString() != '0') ...[
                          const SizedBox(height: 6),
                          Text('+ ${_fmtAmount(_wallet['pendingBalance'])} pending',
                              style: const TextStyle(color: Colors.white60, fontSize: 12)),
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // ── Withdraw form ────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: context.appCardColor,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: context.appBorderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Withdraw to M-Pesa', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _phoneCtrl,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'M-Pesa Phone',
                            hintText: '2547XXXXXXXX',
                            prefixIcon: Icon(Icons.phone_rounded, size: 18),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _amountCtrl,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: 'Amount (KES)',
                            hintText: 'Min. 10',
                            prefixIcon: Icon(Icons.currency_exchange_rounded, size: 18),
                          ),
                        ),
                        const SizedBox(height: 14),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _withdrawing ? null : _withdraw,
                            child: _withdrawing
                                ? const SizedBox(height: 18, width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('Request Withdrawal'),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // ── Transaction history ───────────────────────
                  const Text('Transaction History', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 10),

                  if (_txs.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        color: context.appCardColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.appBorderColor),
                      ),
                      child: Center(child: Text('No transactions yet',
                          style: TextStyle(color: context.appText4))),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(
                        color: context.appCardColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.appBorderColor),
                      ),
                      child: Column(
                        children: _txs.asMap().entries.map((e) {
                          final i  = e.key;
                          final tx = e.value as Map;
                          final type = tx['type'] as String?;
                          return Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                            decoration: BoxDecoration(
                              border: i < _txs.length - 1
                                  ? Border(bottom: BorderSide(color: context.appBorderColor, width: 0.5))
                                  : null,
                            ),
                            child: Row(children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(
                                  color: _txColor(type).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  type == 'credit'
                                      ? Icons.arrow_downward_rounded
                                      : Icons.arrow_upward_rounded,
                                  color: _txColor(type), size: 18,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tx['description']?.toString() ?? 'Transaction',
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                      maxLines: 1, overflow: TextOverflow.ellipsis),
                                  Text(_fmtDate(tx['createdAt']?.toString()),
                                      style: TextStyle(color: context.appText4, fontSize: 11)),
                                ],
                              )),
                              Text(
                                '${_txSign(type)}${_fmtAmount(tx['amount'])}',
                                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14,
                                    color: _txColor(type)),
                              ),
                            ]),
                          );
                        }).toList(),
                      ),
                    ),

                  const SizedBox(height: 30),
                ],
              ),
            ),
    );
  }
}
