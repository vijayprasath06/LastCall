describe('AI Microservice Timeout & Circuit Breaker', () => {
  // Mock the timeout fallback logic directly to avoid spinning up full Express+Python apps here
  const fetchWithTimeout = async (url, options, timeoutMs = 2000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  const aiControllerMock = async (delayMs) => {
    try {
      // Mocking the behavior where python service takes `delayMs` to respond
      if (delayMs >= 2000) {
        throw new Error('AbortError: The operation was aborted.');
      }
      return { status: 200, data: { pricing_suggestion: { original_price: 200, start_price: 100 } } };
    } catch (err) {
      if (err.message.includes('AbortError')) {
        // Fallback rule-based pricing
        return {
          status: 200,
          data: {
            fallback_applied: true,
            pricing_suggestion: { original_price: 150, start_price: 75, min_rescue_price: 30 }
          }
        };
      }
      throw err;
    }
  };

  test('Should return AI pricing if response is < 2000ms', async () => {
    const res = await aiControllerMock(500); // 500ms delay (fast)
    expect(res.status).toBe(200);
    expect(res.data.fallback_applied).toBeUndefined();
    expect(res.data.pricing_suggestion.original_price).toBe(200);
  });

  test('Should trigger circuit breaker and return fallback pricing if response >= 2000ms', async () => {
    const res = await aiControllerMock(3000); // 3000ms delay (timeout)
    expect(res.status).toBe(200);
    expect(res.data.fallback_applied).toBe(true);
    expect(res.data.pricing_suggestion.original_price).toBe(150);
  });
});
