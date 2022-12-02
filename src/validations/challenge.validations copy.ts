import Joi from 'joi';
import { constents } from '../configs/constents.config';
import { speeches } from '../configs/speeches.config';

export const challengeSchema = Joi.object().keys({
    name: Joi.string().required().messages({
        'string.empty': speeches.NAME_REQUIRED
    })
});

export const challengeUpdateSchema = Joi.object().keys({
    status: Joi.string().valid(...Object.values(constents.challenges_flags.list)).required().messages({
        'any.only': speeches.COMMON_STATUS_INVALID,
        'string.empty': speeches.COMMON_STATUS_REQUIRED
    })
});

// export const quizNextQuestionSchema = Joi.object().keys({
//     quiz_id: Joi.string().required().messages({
//         'string.empty': speeches.NAME_REQUIRED
//     })
// });
// export const quizSubmitResponseSchema = Joi.object().keys({
//     // quiz_id: Joi.number().required().messages({
//     //     'string.empty': speeches.QUIZ_ID_REQUIRED
//     // }),
//     quiz_question_id:Joi.number().required().messages({
//         'string.empty': speeches.QUIZ_QUESTION_ID_REQUIRED
//     }),
//     selected_option:Joi.string().required().messages({
//         'string.empty': speeches.SELCTED_OPTION_REQUIRED
//     }),
//     // question:Joi.string().required().messages({
//     //     'string.empty': speeches.QUESTION_REQUIRED
//     // }),
//     // correct_answer:Joi.string().required().messages({
//     //     'string.empty': speeches.CORRECT_ANSWER_REQUIRED
//     // }),
//     // level:Joi.string().required().messages({
//     //     'string.empty': speeches.LEVEL_REQUIRED
//     // }),
//     // question_no:Joi.number().required().messages({
//     //     'string.empty': speeches.QUESTION_NO_REQUIRED
//     // }),
// });

export const initiateIdeaSchema = Joi.object().keys({
    sdg: Joi.string().required().messages({
        'any.only': speeches.COMMON_STATUS_INVALID,
    })
});
export const challengeSubmitResponsesSchema = Joi.object().keys({
    responses: Joi.array().required().messages({
        'any': speeches.SELCTED_OPTION_REQUIRED
    }),
    status: Joi.string().valid(...Object.values(constents.challenges_flags.list)).required().messages({
        'any.only': speeches.COMMON_STATUS_INVALID,
        'string.empty': speeches.COMMON_STATUS_REQUIRED
    }),
    sdg: Joi.any(),
    others: Joi.any(),
});