import { Router } from 'express';
import { sambanovaAIService } from '../services/sambanova-ai-service';

const router = Router();

// Get AI response for chat message
router.post('/ai-response', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    const aiResponse = await sambanovaAIService.getAIResponse(sessionId, message);
    res.json(aiResponse);
  } catch (error: any) {
    console.error('Error getting AI response:', error);
    res.status(500).json({ 
      error: 'Failed to get AI response',
      fallback: {
        response: "I'm having trouble processing your request right now. Let me connect you with a human agent who can help.",
        escalation: {
          shouldEscalate: true,
          reason: 'AI service unavailable',
          urgency: 'medium'
        }
      }
    });
  }
});

// Admin escalation endpoint  
router.post('/admin/escalation', async (req, res) => {
  try {
    const { sessionId, reason, timestamp } = req.body;
    
    if (!sessionId || !reason) {
      return res.status(400).json({ error: 'Session ID and reason are required' });
    }

    // Log escalation for admin dashboard
    // Here you would typically save to database or send notification
    // For now, we'll just acknowledge the escalation
    res.json({ 
      success: true, 
      message: 'Escalation recorded',
      sessionId,
      reason,
      timestamp
    });
  } catch (error: any) {
    console.error('Error handling escalation:', error);
    res.status(500).json({ error: 'Failed to handle escalation' });
  }
});

// Get conversation summary for admin
router.get('/summary/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const summary = await sambanovaAIService.getConversationSummary(sessionId);
    res.json({ summary });
  } catch (error: any) {
    console.error('Error getting conversation summary:', error);
    res.status(500).json({ error: 'Failed to get conversation summary' });
  }
});

export { router as chatRoutes };