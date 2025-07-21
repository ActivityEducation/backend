import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as jsonld from 'jsonld';

/**
 * Controller to serve the JSON-LD context for the EducationPub vocabulary.
 * This context is crucial for ActivityPub implementations to understand
 * and process objects and properties defined under the 'edu:' namespace.
 *
 * The URI 'https://social.bleauweb.org/ns/education-pub' is the stable, resolvable URI
 * for your deployed vocabulary.
 *
 * Usage:
 * When an ActivityPub consumer encounters an object with 'edu:' prefixed
 * properties, it will look for the definition of 'edu:' in its '@context'.
 * By serving this JSON-LD file at the specified URI, you provide that definition.
 */
@ApiTags('Namespace')
@Controller('ns')
export class JsonLDNamespaceController {
  /**
   * Serves the EducationPub JSON-LD context document.
   * The path '/ns/education-pub' should correspond to the URI used in your
   * ActivityPub objects (e.g., "https://social.bleauweb.org/ns/education-pub").
   *
   * @returns The JSON-LD context object.
   */
  @Get('education-pub')
  @Header('Content-Type', 'application/ld+json')
  public getEducationPubNamespace(): jsonld {
    // This is the JSON-LD context object for your EducationPub specification.
    // It maps the 'edu:' prefix to a base URI and defines the terms
    // within that namespace.
    return {
      '@context': {
        // Define the base URI for the 'edu' prefix.
        // This URI now points to your production domain.
        // The '#' at the end is common for vocabulary definitions.
        edu: 'https://social.bleauweb.org/ns/education-pub#',

        // Define the terms (properties and types) within the 'edu' namespace.
        // Each term maps to its full URI.
        // For example, "edu:FlashcardModel" maps to "https://social.bleauweb.org/ns/education-pub#FlashcardModel"
        // and "edu:fields" maps to "https://social.bleauweb.org/ns/education-pub#fields".

        // Object Types
        'edu:FlashcardModel': { '@id': 'edu:FlashcardModel' },
        'edu:Flashcard': { '@id': 'edu:Flashcard' },
        'edu:Story': { '@id': 'edu:Story' },
        'edu:VideoLesson': { '@id': 'edu:VideoLesson' },
        'edu:SelfAssessment': { '@id': 'edu:SelfAssessment' },
        'edu:Question': { '@id': 'edu:Question' }, // Embedded type
        'edu:WritingPrompt': { '@id': 'edu:WritingPrompt' },
        'edu:Exercise': { '@id': 'edu:Exercise' },
        'edu:PronunciationExercise': { '@id': 'edu:PronunciationExercise' },
        'edu:Objective': { '@id': 'edu:Objective' },
        'edu:KeyResult': { '@id': 'edu:KeyResult' }, // Embedded type
        'edu:AssessmentResponse': { '@id': 'edu:AssessmentResponse' },
        'edu:WritingSubmission': { '@id': 'edu:WritingSubmission' },
        'edu:PeerReview': { '@id': 'edu:PeerReview' },

        // Properties
        'edu:fields': { '@id': 'edu:fields', '@type': '@json' }, // @json indicates it's a JSON object/array
        'edu:fieldName': { '@id': 'edu:fieldName' },
        'edu:fieldType': { '@id': 'edu:fieldType' },
        'edu:required': { '@id': 'edu:required', '@type': 'xsd:boolean' },
        'edu:cardTemplates': { '@id': 'edu:cardTemplates', '@type': '@json' },
        'edu:templateName': { '@id': 'edu:templateName' },
        'edu:frontTemplate': { '@id': 'edu:frontTemplate' },
        'edu:backTemplate': { '@id': 'edu:backTemplate' },
        'edu:cardDirection': { '@id': 'edu:cardDirection' },
        'edu:stylingCSS': { '@id': 'edu:stylingCSS' },
        'edu:model': { '@id': 'edu:model', '@type': '@id' }, // @id indicates it's a URI reference
        'edu:fieldsData': { '@id': 'edu:fieldsData', '@type': '@json' },
        'edu:tags': { '@id': 'edu:tags', '@type': '@json' },
        'edu:relatedTo': { '@id': 'edu:relatedTo', '@type': '@id' },
        'edu:targetLanguage': { '@id': 'edu:targetLanguage' },
        'edu:sourceLanguage': { '@id': 'edu:sourceLanguage' },
        'edu:audio': { '@id': 'edu:audio', '@type': '@id' },
        'edu:glossary': { '@id': 'edu:glossary', '@type': '@json' },
        'edu:comprehensionQuestions': {
          '@id': 'edu:comprehensionQuestions',
          '@type': '@json',
        },
        'edu:level': { '@id': 'edu:level' },
        'edu:transcript': { '@id': 'edu:transcript' },
        'edu:discussionPrompts': {
          '@id': 'edu:discussionPrompts',
          '@type': '@json',
        },
        'edu:interactiveElements': {
          '@id': 'edu:interactiveElements',
          '@type': '@json',
        },
        'edu:element': { '@id': 'edu:element', '@type': '@id' },
        'edu:assessmentType': { '@id': 'edu:assessmentType' },
        'edu:questions': { '@id': 'edu:questions', '@type': '@json' },
        'edu:expectedResponse': {
          '@id': 'edu:expectedResponse',
          '@type': '@id',
        },
        'edu:questionType': { '@id': 'edu:questionType' },
        'edu:options': { '@id': 'edu:options', '@type': '@json' },
        'edu:correctAnswer': { '@id': 'edu:correctAnswer', '@type': '@json' },
        'edu:feedback': { '@id': 'edu:feedback' },
        'edu:media': { '@id': 'edu:media', '@type': '@id' },
        'edu:wordCountTarget': { '@id': 'edu:wordCountTarget' },
        'edu:topics': { '@id': 'edu:topics', '@type': '@json' },
        'edu:targetAudience': { '@id': 'edu:targetAudience' },
        'edu:expectedSubmission': {
          '@id': 'edu:expectedSubmission',
          '@type': '@id',
        },
        'edu:exerciseType': { '@id': 'edu:exerciseType' },
        'edu:difficulty': { '@id': 'edu:difficulty' },
        'edu:phrase': { '@id': 'edu:phrase' },
        'edu:referenceAudio': { '@id': 'edu:referenceAudio', '@type': '@id' },
        'edu:feedbackMechanism': { '@id': 'edu:feedbackMechanism' },
        'edu:keyResults': { '@id': 'edu:keyResults', '@type': '@json' },
        'edu:targetDate': { '@id': 'edu:targetDate', '@type': 'xsd:dateTime' },
        'edu:status': { '@id': 'edu:status' },
        'edu:metricType': { '@id': 'edu:metricType' },
        'edu:targetValue': { '@id': 'edu:targetValue', '@type': 'xsd:decimal' },
        'edu:currentValue': {
          '@id': 'edu:currentValue',
          '@type': 'xsd:decimal',
        },
        'edu:unit': { '@id': 'edu:unit' },
        'edu:updated': { '@id': 'edu:updated', '@type': 'xsd:dateTime' },
        'edu:responses': { '@id': 'edu:responses', '@type': '@json' },
        'edu:question': { '@id': 'edu:question', '@type': '@id' },
        'edu:learnerAnswer': { '@id': 'edu:learnerAnswer', '@type': '@json' },
        'edu:isCorrect': { '@id': 'edu:isCorrect', '@type': 'xsd:boolean' },
        'edu:score': { '@id': 'edu:score', '@type': 'xsd:decimal' },
        'edu:overallScore': {
          '@id': 'edu:overallScore',
          '@type': 'xsd:decimal',
        },
        'edu:maxScore': { '@id': 'edu:maxScore', '@type': 'xsd:decimal' },
        'edu:completionDate': {
          '@id': 'edu:completionDate',
          '@type': 'xsd:dateTime',
        },
        'edu:wordCount': { '@id': 'edu:wordCount', '@type': 'xsd:integer' },
        'edu:submissionDate': {
          '@id': 'edu:submissionDate',
          '@type': 'xsd:dateTime',
        },
        'edu:grade': { '@id': 'edu:grade', '@type': 'xsd:decimal' }, // Or xsd:string if qualitative
        'edu:rating': { '@id': 'edu:rating', '@type': 'xsd:decimal' }, // Or xsd:string
        'edu:strengths': { '@id': 'edu:strengths', '@type': '@json' },
        'edu:areasForImprovement': {
          '@id': 'edu:areasForImprovement',
          '@type': '@json',
        },
        'edu:feedbackType': { '@id': 'edu:feedbackType' },
        'edu:rubric': { '@id': 'edu:rubric', '@type': '@id' },

        // XSD types for explicit type mapping (used for properties like boolean, decimal, dateTime)
        xsd: 'http://www.w3.org/2001/XMLSchema#',
      },
    };
  }
}
