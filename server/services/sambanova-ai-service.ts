import { firebaseRealtimeStorage } from '../firebase-realtime-storage';
import { logger } from '../utils/logger';

interface SambaNovaResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  output?: {
    choices?: Array<{
      text?: string;
    }>;
  };
  generated_text?: string;
  text?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
}

export class SambaNovaAIService {
  private apiKey: string;
  private baseUrl = 'https://api.sambanova.ai/v1/chat/completions'; // Adjust based on actual SambaNova API endpoint
  private conversationHistory = new Map<string, ChatMessage[]>();

  constructor() {
    this.apiKey = process.env.SAMBANOVA_API_KEY || '';
    if (this.apiKey) {
      logger.info('SambaNova AI service initialized', { context: 'AI' });
    }
  }

  // Get AI response for customer inquiry
  async getAIResponse(sessionId: string, userMessage: string): Promise<{
    response: string;
    escalation: EscalationDecision;
  }> {
    if (!this.apiKey) {
      throw new Error('SambaNova AI is not configured. Please set SAMBANOVA_API_KEY environment variable.');
    }
    
    try {
      // Get conversation history for context
      const history = this.conversationHistory.get(sessionId) || [];
      
      // Get comprehensive business context
      const [pcBuilds, businessSettings, components, lowStockData] = await Promise.all([
        firebaseRealtimeStorage.getPcBuilds(),
        this.getBusinessSettings(),
        this.getComponentsData(),
        firebaseRealtimeStorage.getLowStockItems()
      ]);
      
      // Create comprehensive context-aware prompt
      const systemPrompt = this.createComprehensiveSystemPrompt(pcBuilds, businessSettings, components, lowStockData);
      
      // Build conversation history in SambaNova format
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage }
      ];

      const response = await this.callSambaNovaAPI(messages);
      
      // Update conversation history
      history.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response }
      );
      this.conversationHistory.set(sessionId, history);

      // Determine if escalation is needed
      const escalation = await this.determineEscalation(userMessage, response);

      return { response, escalation };
    } catch (error) {
      logger.error('SambaNova AI Service error', error, { context: 'AI' });
      
      // Return fallback response with escalation
      return {
        response: "I'm experiencing technical difficulties right now. Let me connect you with our support team who can assist you immediately.",
        escalation: {
          shouldEscalate: true,
          reason: 'AI service unavailable',
          urgency: 'medium'
        }
      };
    }
  }

  // Get business settings for context
  private async getBusinessSettings(): Promise<any> {
    try {
      const response = await fetch('http://localhost:5000/api/business-settings');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
    }
    return {
      businessEmail: 'contact@fusionforgepc.com',
      businessPhone: '+91-XXXX-XXXX',
      businessHours: '9 AM - 6 PM',
      companyName: 'FusionForge PCs'
    };
  }

  // Get components data for detailed specifications
  private async getComponentsData(): Promise<any[]> {
    try {
      const allBuilds = await firebaseRealtimeStorage.getPcBuilds();
      const allComponents = [];
      
      for (const build of allBuilds) {
        const components = await firebaseRealtimeStorage.getComponentsByBuildId(build.id);
        allComponents.push(...components);
      }
      
      return allComponents;
    } catch (error) {
      return [];
    }
  }

  // Create comprehensive system prompt with full business knowledge
  private createComprehensiveSystemPrompt(pcBuilds: any[], businessSettings: any, components: any[], lowStockData: any): string {
    const buildsContext = pcBuilds.map(build => 
      `${build.name}: ₹${build.basePrice?.toLocaleString() || 'N/A'} - ${build.description || 'Custom PC build'} (Stock: ${build.stockQuantity || 0})`
    ).join('\n');

    const componentsContext = components.slice(0, 20).map(comp => 
      `${comp.name}: ${comp.specification} - ₹${comp.price} (${comp.type})`
    ).join('\n');

    const lowStockWarnings = lowStockData.builds.length > 0 || lowStockData.components.length > 0 
      ? `\nLOW STOCK ALERTS:\n${lowStockData.builds.map((b: any) => `- ${b.name}: Only ${b.stockQuantity} left`).join('\n')}\n${lowStockData.components.map((c: any) => `- ${c.name}: Only ${c.stockQuantity} left`).join('\n')}`
      : '';

    return `You are FusionForge AI Assistant, an expert in custom PC building and computer hardware. You work for FusionForge PCs, a premium PC building company in India.

COMPANY CONTACT INFO:
- Email: ${businessSettings.businessEmail || 'contact@fusionforgepc.com'}
- Phone: ${businessSettings.businessPhone || '+91-XXXX-XXXX'}
- Business Hours: ${businessSettings.businessHours || '9 AM - 6 PM'}
- Company: ${businessSettings.companyName || 'FusionForge PCs'}

BUSINESS SERVICES:
- Custom PC building and assembly
- Component selection and compatibility checking
- Performance optimization consulting
- Warranty and after-sales support
- Delivery and installation services

AVAILABLE PC BUILDS (₹15,000 - ₹1,50,000):
${buildsContext}

KEY COMPONENTS & SPECIFICATIONS:
${componentsContext}${lowStockWarnings}

PAYMENT & DELIVERY:
- Payment: UPI, Net Banking, Credit/Debit Cards, EMI via Razorpay
- EMI available for orders above ₹10,000
- Delivery: 3-5 business days (standard), 5-7 days (custom builds)
- Free delivery for orders above ₹25,000
- Assembly warranty: 1 year + component warranties (1-3 years)

RESPONSE GUIDELINES:
1. Be helpful, knowledgeable, and professional
2. Provide specific recommendations based on user needs and budget
3. Include accurate pricing in Indian Rupees (₹)
4. Mention stock availability when relevant
5. Suggest compatible components and upgrades
6. Explain technical concepts in simple terms
7. Keep responses concise but informative (2-3 sentences max)
8. Always offer customization options

ESCALATION TRIGGERS:
- Order modifications, cancellations, or tracking
- Payment issues, refunds, or EMI problems
- Hardware defects, warranty claims, or returns
- Complex technical troubleshooting (hardware failures)
- Specific delivery dates or installation requests
- Complaints, dissatisfaction, or manager requests
- Requests exceeding your technical knowledge

Remember: You represent FusionForge PCs. Be confident about our products and services while being honest about limitations. Focus on solving customer needs with our available builds and components.`;
  }

  // Call SambaNova API with conversation context
  private async callSambaNovaAPI(messages: ChatMessage[]): Promise<string> {
    // SambaNova API typically uses a chat completions format
    // Adjust the payload structure based on actual SambaNova API documentation
    const payload = {
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', // Adjust model name based on your SambaNova deployment
      messages: messages,
      temperature: 0.7,
      max_tokens: 300,
      stream: false
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        // Some SambaNova APIs use different auth headers, adjust as needed
        // 'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`SambaNova API error: ${response.status} ${response.statusText}`);
    }

    const data: SambaNovaResponse = await response.json();
    
    // Handle different possible response formats from SambaNova
    let responseText = '';
    
    if (data.choices && data.choices[0]) {
      responseText = data.choices[0].message?.content || data.choices[0].text || '';
    } else if (data.output?.choices?.[0]?.text) {
      responseText = data.output.choices[0].text;
    } else if (data.generated_text) {
      responseText = data.generated_text;
    } else if (data.text) {
      responseText = data.text;
    }
    
    if (!responseText) {
      throw new Error('No response from SambaNova API');
    }

    return responseText.trim();
  }

  // Determine if conversation should be escalated to human agent
  private async determineEscalation(userMessage: string, aiResponse: string): Promise<EscalationDecision> {
    const escalationKeywords = [
      'speak to manager', 'human agent', 'not working', 'broken', 'defective',
      'refund', 'cancel order', 'complaint', 'dissatisfied', 'unhappy',
      'delivery date', 'when will it arrive', 'track order', 'order status',
      'warranty claim', 'technical issue', 'not booting', 'blue screen',
      'overheating', 'noise', 'performance issue'
    ];

    const urgentKeywords = [
      'urgent', 'emergency', 'immediately', 'asap', 'right now',
      'critical', 'important', 'deadline', 'today'
    ];

    const message = userMessage.toLowerCase();
    
    // Check for escalation keywords
    const hasEscalationKeyword = escalationKeywords.some(keyword => 
      message.includes(keyword.toLowerCase())
    );

    // Check for urgent keywords
    const hasUrgentKeyword = urgentKeywords.some(keyword =>
      message.includes(keyword.toLowerCase())
    );

    // Check if AI couldn't provide a helpful response
    const aiIndicatesEscalation = aiResponse.toLowerCase().includes('connect you') ||
                                  aiResponse.toLowerCase().includes('support team') ||
                                  aiResponse.toLowerCase().includes('human agent');

    if (hasEscalationKeyword || aiIndicatesEscalation) {
      return {
        shouldEscalate: true,
        reason: hasEscalationKeyword ? 'Customer request requires human assistance' : 'AI unable to resolve query',
        urgency: hasUrgentKeyword ? 'urgent' : 'high'
      };
    }

    // Check for medium priority escalation (technical questions)
    const technicalKeywords = ['compatibility', 'upgrade', 'installation', 'setup', 'configuration'];
    const hasTechnicalKeyword = technicalKeywords.some(keyword =>
      message.includes(keyword.toLowerCase())
    );

    if (hasTechnicalKeyword && message.length > 100) {
      return {
        shouldEscalate: true,
        reason: 'Complex technical query may need expert assistance',
        urgency: 'medium'
      };
    }

    return {
      shouldEscalate: false,
      reason: 'AI can handle this query',
      urgency: 'low'
    };
  }

  // Clear conversation history for a session
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }

  // Get conversation summary for admin handoff
  async getConversationSummary(sessionId: string): Promise<string> {
    const history = this.conversationHistory.get(sessionId);
    if (!history || history.length === 0) {
      return 'No conversation history available.';
    }

    const messages = history
      .map(msg => `${msg.role === 'user' ? 'Customer' : 'AI'}: ${msg.content}`)
      .join('\n');

    return `Conversation Summary:\n${messages}`;
  }
}

export const sambanovaAIService = new SambaNovaAIService();

