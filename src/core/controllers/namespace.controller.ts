import { Controller, Get, Header } from '@nestjs/common';

@Controller('ns/educationpub')
export class JsonLDNamespaceController {
  @Get()
  @Header('Content-Type', 'application/ld+json')
  getJsonLdContext() {
    return {
      '@context': {
        '@version': 1.1,
        as: 'https://www.w3.org/ns/activitystreams#',
        edu: 'https://edupub.social/ns/educationpub#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',

        // EduPub Object Types
        FlashcardModel: 'edu:FlashcardModel',
        Flashcard: 'edu:Flashcard',
        Story: 'edu:Story',
        VideoLesson: 'edu:VideoLesson',
        Question: 'edu:Question',
        SelfAssessment: 'edu:SelfAssessment',
        WritingPrompt: 'edu:WritingPrompt',
        Exercise: 'edu:Exercise',
        Objective: 'edu:Objective',
        KeyResult: 'edu:KeyResult',
        AssessmentResponse: 'edu:AssessmentResponse',
        WritingSubmission: 'edu:WritingSubmission',
        Rubric: 'edu:Rubric',
        PeerReview: 'edu:PeerReview',

        // EduPub Properties
        fields: { '@id': 'edu:fields', '@container': '@list' },
        cardTemplates: { '@id': 'edu:cardTemplates', '@container': '@list' },
        model: { '@id': 'edu:model', '@type': '@id' },
        fieldsData: 'edu:fieldsData',
        tags: 'edu:tags',
        relatedTo: { '@id': 'edu:relatedTo', '@type': '@id' },
        targetLanguage: 'edu:targetLanguage',
        sourceLanguage: 'edu:sourceLanguage',
        audio: { '@id': 'edu:audio', '@type': '@id' },
        glossary: 'edu:glossary',
        comprehensionQuestions: 'edu:comprehensionQuestions',
        level: 'edu:level',
        transcript: 'edu:transcript',
        discussionPrompts: 'edu:discussionPrompts',
        interactiveElements: 'edu:interactiveElements',
        questionType: 'edu:questionType',
        options: 'edu:options',
        correctAnswer: 'edu:correctAnswer',
        feedback: 'edu:feedback',
        media: { '@id': 'edu:media', '@type': '@id' },
        assessmentType: 'edu:assessmentType',
        questions: 'edu:questions',
        expectedResponse: { '@id': 'edu:expectedResponse', '@type': '@id' },
        wordCountTarget: 'edu:wordCountTarget',
        topics: 'edu:topics',
        targetAudience: 'edu:targetAudience',
        expectedSubmission: { '@id': 'edu:expectedSubmission', '@type': '@id' },
        exerciseType: 'edu:exerciseType',
        phrase: 'edu:phrase',
        referenceAudio: { '@id': 'edu:referenceAudio', '@type': '@id' },
        feedbackMechanism: 'edu:feedbackMechanism',
        keyResults: 'edu:keyResults',
        targetDate: { '@id': 'edu:targetDate', '@type': 'xsd:dateTime' },
        status: 'edu:status',
        metricType: 'edu:metricType',
        targetValue: 'edu:targetValue',
        currentValue: 'edu:currentValue',
        unit: 'edu:unit',
        responses: 'edu:responses',
        overallScore: 'edu:overallScore',
        maxScore: 'edu:maxScore',
        completionDate: { '@id': 'edu:completionDate', '@type': 'xsd:dateTime' },
        wordCount: { '@id': 'edu:wordCount', '@type': 'xsd:integer' },
        submissionDate: { '@id': 'edu:submissionDate', '@type': 'xsd:dateTime' },
        grade: 'edu:grade',
        criteria: 'edu:criteria',
        levels: 'edu:levels',
        descriptors: 'edu:descriptors',
        scoringMethod: 'edu:scoringMethod',
        alignsWith: { '@id': 'edu:alignsWith', '@type': '@id' },
        rating: 'edu:rating',
        strengths: 'edu:strengths',
        areasForImprovement: 'edu:areasForImprovement',
        feedbackType: 'edu:feedbackType',
        rubric: { '@id': 'edu:rubric', '@type': '@id' },

        // EduPub Activity Types
        Submit: 'edu:Submit',
        Review: 'edu:Review',
      },
    };
  }
}
