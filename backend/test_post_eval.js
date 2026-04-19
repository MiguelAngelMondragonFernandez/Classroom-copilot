(async ()=>{
  try {
    const cookie = 'session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZ29vZ2xlSWQiOiIxMTY5NDUwNjUwODM4NTUwOTY5NjAiLCJlbWFpbCI6Im1pY2t2ZXJnYXJhN0BnbWFpbC5jb20iLCJpYXQiOjE3NzM1NDc1NTUsImV4cCI6MTc3NDE1MjM1NX0.MzwggV0-fB8hatO3glzHL_8cl0W7xa7x8QeX2ewoAgQ';

    const tests = [
      { name: 'minimal', body: { courseId: '413726323410', activity: { titulo: 'Prueba minima', instrucciones: 'Instrucciones cortas' } } },
      { name: 'withTopic', body: { courseId: '413726323410', topicId: '851661180831', activity: { titulo: 'Prueba con topic', instrucciones: 'Instrucciones con topic' } } },
      { name: 'ascii', body: { courseId: '413726323410', activity: { titulo: 'Simple Title', instrucciones: 'Simple instructions' } } },
    ];

    for (const t of tests) {
      console.log('\n=== Test:', t.name, '===');
      const res = await fetch('http://localhost:3001/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify(t.body),
      });
      const text = await res.text();
      console.log('Status', res.status);
      console.log(text);
    }
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
