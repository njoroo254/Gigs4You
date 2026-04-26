import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';

class ManagerWalletTab extends StatefulWidget {
  const ManagerWalletTab({super.key});
  @override
  State<ManagerWalletTab> createState() => _ManagerWalletTabState();
}

class _ManagerWalletTabState extends State<ManagerWalletTab> {
  Map<String, dynamic> _wallet = {};
  List<dynamic> _txs = [];
  bool _loading = true;
  bool _topuping = false;
  bool _showTopup = false;

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
    final results = await Future.wait([api.getOrgWallet(), api.getOrgTransactions()]);
    if (mounted) {
      setState(() {
        _wallet  = results[0] as Map<String, dynamic>;
        _txs     = results[1] as List<dynamic>;
        _loading = false;
      });
    }
  }

  Future<void> _topup() async {
    final amount = double.tryParse(_amountCtrl.text.trim());
    final phone  = _phoneCtrl.text.trim();
    if (phone.isEmpty)  { _snack('Enter a phone number'); return; }
    if (amount == null || amount < 10) { _snack('Minimum topup is KES 10'); return; }

    setState(() => _topuping = true);
    try {
      final api = context.read<ApiClient>();
      await api.topupOrgWallet(phone, amount);
      _snack('STK Push sent to $phone. Enter your M-Pesa PIN to confirm.', ok: true);
      setState(() => _showTopup = false);
      _phoneCtrl.clear(); _amountCtrl.clear();
      // Refresh after 6 s to pick up the credited balance
      await Future.delayed(const Duration(seconds: 6));
      if (mounted) await _load();
    } catch (e) {
      _snack(_extractError(e));
    } finally {
      if (mounted) setState(() => _topuping = false);
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
    if (type == 'deposit')      return AppColors.primary;
    if (type == 'disbursement') return AppColors.danger;
    if (type == 'refund')       return AppColors.info;
    return AppColors.text3;
  }

  String _txSign(String? type) => type == 'disbursement' ? '-' : '+';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      appBar: AppBar(
        backgroundColor: context.appNavBarColor,
        elevation: 0,
        title: const Text('Org Wallet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
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
          : Stack(
              children: [
                RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // ── Balance cards ─────────────────────────
                      Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
                            begin: Alignment.topLeft, end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.3),
                            blurRadius: 16, offset: const Offset(0, 6),
                          )],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(children: [
                              Icon(Icons.account_balance_wallet_rounded, color: Colors.white70, size: 18),
                              SizedBox(width: 6),
                              Text('Organisation Wallet', style: TextStyle(color: Colors.white70, fontSize: 13)),
                            ]),
                            const SizedBox(height: 8),
                            Text(_fmtAmount(_wallet['balance']),
                                style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 10),
                            Row(children: [
                              _statChip('Deposited', _fmtAmount(_wallet['totalDeposited'])),
                              const SizedBox(width: 10),
                              _statChip('Disbursed', _fmtAmount(_wallet['totalDisbursed'])),
                            ]),
                          ],
                        ),
                      ),

                      const SizedBox(height: 14),

                      // ── Topup button ─────────────────────────
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => setState(() => _showTopup = true),
                          icon: const Icon(Icons.add_circle_outline_rounded, size: 18),
                          label: const Text('Topup via M-Pesa STK Push'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primary),
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),

                      const SizedBox(height: 20),

                      // ── Transaction history ───────────────────
                      const Text('Transaction History',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
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
                            children: _txs.asMap().entries.map((entry) {
                              final i  = entry.key;
                              final tx = entry.value as Map;
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
                                      type == 'deposit' ? Icons.arrow_downward_rounded
                                        : type == 'refund' ? Icons.undo_rounded
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

                // ── Topup bottom sheet ────────────────────────
                if (_showTopup) ...[
                  GestureDetector(
                    onTap: () => setState(() => _showTopup = false),
                    child: Container(color: Colors.black54),
                  ),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Container(
                      padding: EdgeInsets.fromLTRB(20, 20, 20,
                          MediaQuery.of(context).viewInsets.bottom + 20),
                      decoration: BoxDecoration(
                        color: context.appCardColor,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Topup Org Wallet',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 16),
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
                              hintText: 'e.g. 5000',
                              prefixIcon: Icon(Icons.currency_exchange_rounded, size: 18),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => setState(() => _showTopup = false),
                                child: const Text('Cancel'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              flex: 2,
                              child: ElevatedButton(
                                onPressed: _topuping ? null : _topup,
                                child: _topuping
                                    ? const SizedBox(height: 18, width: 18,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : const Text('Send STK Push'),
                              ),
                            ),
                          ]),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _statChip(String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10)),
            Text(value,  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
