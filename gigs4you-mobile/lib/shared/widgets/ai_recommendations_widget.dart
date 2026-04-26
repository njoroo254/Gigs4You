import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class AIRecommendationsWidget extends StatefulWidget {
  final String? userId;
  final String? userRole;
  final String? orgId;
  final String apiUrl;

  const AIRecommendationsWidget({
    super.key,
    this.userId,
    this.userRole,
    this.orgId,
    this.apiUrl = 'http://10.0.2.2:8001/recommendations/personalize',
  });

  @override
  State<AIRecommendationsWidget> createState() =>
      _AIRecommendationsWidgetState();
}

class _AIRecommendationsWidgetState extends State<AIRecommendationsWidget> {
  List<Map<String, dynamic>> _recommendations = [];
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRecommendations();
  }

  Future<void> _loadRecommendations() async {
    if (widget.userId == null) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await http.post(
        Uri.parse(widget.apiUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'user_id': widget.userId,
          'user_type': _mapRoleToType(widget.userRole),
          'context': {
            'org_id': widget.orgId,
            'platform': 'mobile',
          },
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _recommendations =
              List<Map<String, dynamic>>.from(data['recommendations'] ?? []);
        });
      } else {
        setState(() {
          _error = 'Failed to load recommendations';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Network error. Please try again.';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  String _mapRoleToType(String? role) {
    if (role == null) return 'worker';
    if (['super_admin', 'admin', 'manager', 'supervisor', 'employer']
        .contains(role)) {
      return 'employer';
    }
    return 'worker';
  }

  IconData _getRecommendationIcon(String type) {
    switch (type.toLowerCase()) {
      case 'job':
        return Icons.work;
      case 'skill':
        return Icons.school;
      case 'worker':
        return Icons.person;
      case 'pricing':
        return Icons.attach_money;
      default:
        return Icons.lightbulb;
    }
  }

  Color _getRecommendationColor(String type) {
    switch (type.toLowerCase()) {
      case 'job':
        return Colors.blue;
      case 'skill':
        return Colors.green;
      case 'worker':
        return Colors.orange;
      case 'pricing':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.smart_toy,
                  color: Theme.of(context).primaryColor,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Text(
                  'AI Recommendations',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: _loadRecommendations,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh recommendations',
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null)
              Center(
                child: Column(
                  children: [
                    Icon(
                      Icons.error_outline,
                      color: Colors.red,
                      size: 48,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: const TextStyle(color: Colors.red),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _loadRecommendations,
                      child: const Text('Try Again'),
                    ),
                  ],
                ),
              )
            else if (_recommendations.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(
                        Icons.lightbulb_outline,
                        color: Colors.grey,
                        size: 48,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'No recommendations available yet.\nComplete more tasks to get personalized suggestions!',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              )
            else
              ..._recommendations.map((rec) => _buildRecommendationCard(rec)),
          ],
        ),
      ),
    );
  }

  Widget _buildRecommendationCard(Map<String, dynamic> recommendation) {
    final type = recommendation['type'] as String? ?? 'general';
    final title = recommendation['title'] as String? ?? 'Recommendation';
    final description = recommendation['description'] as String? ?? '';
    final confidence =
        (recommendation['confidence'] as num?)?.toDouble() ?? 0.0;

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _getRecommendationColor(type).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _getRecommendationIcon(type),
                color: _getRecommendationColor(type),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        Icons.verified,
                        color: Colors.green,
                        size: 16,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${(confidence * 100).round()}% confidence',
                        style: TextStyle(
                          color: Colors.green,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
