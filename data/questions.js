const questions = Array.from({ length: 3 }).map((_, i) => {
  const labels = ['Never', 'Occasionally', 'Sometimes', 'Often', 'Always']
  return {
    id: i + 1,
    category: 'Sleep Environment',
    question: `How often does item #${i + 1} disrupt your sleep?`,
    type: 'choice',
    options: labels
  }
})

// Add two scale fallback questions so developers can see the new UI without the sheet
questions.push({ id: 101, category: 'Sleep Habits', question: 'On a scale of 1-5, how disruptive is your sleep?', type: 'scale', options: ['1','2','3','4','5'] })
questions.push({ id: 102, category: 'Sleep Environment', question: 'On a scale of 1-5, how comfortable is your bed?', type: 'scale', options: ['1','2','3','4','5'] })
// add anchors to fallback scale items
questions[questions.length - 2].anchors = ['Not Disruptive', 'Highly Disruptive']
questions[questions.length - 1].anchors = ['Very Uncomfortable', 'Very Comfortable']

export default questions
