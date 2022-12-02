import Boom, { badData, badRequest, internal, notAcceptable, notFound, unauthorized } from "boom";
import { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";
import db from "../utils/dbconnection.util";
import { constents } from "../configs/constents.config";
import { speeches } from "../configs/speeches.config";
import validationMiddleware from "../middlewares/validation.middleware";
import { challenge_question } from "../models/challenge_questions.model";
import { challenge_response } from "../models/challenge_response.model";
import dispatcher from "../utils/dispatch.util";
import { quizSchema, quizSubmitResponseSchema, quizUpdateSchema } from "../validations/quiz.validations";
import ValidationsHolder from "../validations/validationHolder";
import BaseController from "./base.controller";
import { quizSubmitResponsesSchema } from "../validations/quiz_survey.validations";
import { challengeSchema, challengeSubmitResponsesSchema, challengeUpdateSchema, initiateIdeaSchema } from "../validations/challenge.validations copy";
import { orderBy } from "lodash";
import { student } from "../models/student.model";
import { forbidden } from "joi";

export default class ChallengeController extends BaseController {

    model = "challenge";

    protected initializePath(): void {
        this.path = '/challenge';
    }
    protected initializeValidations(): void {
        this.validations = new ValidationsHolder(challengeSchema, challengeUpdateSchema);
    }
    protected initializeRoutes(): void {
        //example route to add 
        this.router.post(this.path + "/:id/submission/", validationMiddleware(challengeSubmitResponsesSchema), this.submitResponses.bind(this));
        this.router.post(this.path + "/:id/initiate/", validationMiddleware(initiateIdeaSchema), this.initiateIdea.bind(this));
        this.router.get(this.path + '/submittedDetails', this.getResponse.bind(this));
        this.router.get(`${this.path}/clearResponse`, this.clearResponse.bind(this))
        super.initializeRoutes();
    }

    protected async getData(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            let user_id = res.locals.user_id;
            let { team_id } = req.query;
            if (!user_id) {
                throw unauthorized(speeches.UNAUTHORIZED_ACCESS)
            }
            let data: any;
            const { model, id } = req.params;
            const paramStatus: any = req.query.status;
            if (model) {
                this.model = model;
            };
            // pagination
            const { page, size, title } = req.query;
            let condition: any = {};
            if (title) {
                condition.title = { [Op.like]: `%${title}%` }
            }
            const { limit, offset } = this.getPagination(page, size);
            const modelClass = await this.loadModel(model).catch(error => {
                next(error)
            });
            const where: any = {};
            let whereClauseStatusPart: any = {}
            let boolStatusWhereClauseRequired = false;
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                if (paramStatus === 'ALL') {
                    whereClauseStatusPart = {};
                    boolStatusWhereClauseRequired = false;
                } else {
                    whereClauseStatusPart = { "status": paramStatus };
                    boolStatusWhereClauseRequired = true;
                }
            } else {
                whereClauseStatusPart = { "status": "ACTIVE" };
                boolStatusWhereClauseRequired = true;
            }
            if (id) {
                where[`${this.model}_id`] = req.params.id;
                // console.log(where)
                data = await this.crudService.findOne(modelClass, {
                    where: {
                        [Op.and]: [
                            whereClauseStatusPart,
                            where,
                            condition
                        ]
                    },
                    include: {
                        required: false,
                        model: challenge_question,
                    }
                });
            } else {
                try {
                    const responseOfFindAndCountAll = await this.crudService.findAndCountAll(modelClass, {
                        where: {
                            [Op.and]: [
                                whereClauseStatusPart,
                                condition
                            ]
                        },
                        include: {
                            required: false,
                            model: challenge_question
                        },
                        limit, offset,
                        order: [
                            [challenge_question, 'question_no', 'ASC']
                        ]
                    })
                    const result = this.getPagingData(responseOfFindAndCountAll, page, limit);
                    data = result;
                } catch (error: any) {
                    return res.status(500).send(dispatcher(res, data, 'error'))
                }

            }
            if (!data || data instanceof Error) {
                if (data != null) {
                    throw notFound(data.message)
                } else {
                    throw notFound()
                }
                res.status(200).send(dispatcher(res, null, "error", speeches.DATA_NOT_FOUND));
                (data.message)
            }

            return res.status(200).send(dispatcher(res, data, 'success'));
        } catch (error) {
            next(error);
        }
    }
    protected async insertSingleResponse(team_id: any, user_id: any, challenge_id: any, challenge_question_id: any, selected_option: any) {
        try {
            const questionAnswered = await this.crudService.findOne(challenge_question, { where: { challenge_question_id } });
            if (questionAnswered instanceof Error) {
                throw internal(questionAnswered.message)
            }
            if (!questionAnswered) {
                throw badData("Invalid Quiz question id")
            }
            const challengeRes = await this.crudService.findOne(challenge_response, { where: { challenge_id, team_id } });
            if (challengeRes instanceof Error) {
                throw internal(challengeRes.message)
            }
            const studentDetailsBasedOnTeam = await this.crudService.findAll(student, { where: { team_id } });
            if (studentDetailsBasedOnTeam instanceof Error) {
                throw internal(studentDetailsBasedOnTeam.message)
            };
            // console.log(studentDetailsBasedOnTeam.length);
            let dataToUpsert: any = {}
            dataToUpsert = { challenge_id, team_id, updated_by: user_id, initiated_by: user_id, submitted_by: user_id }
            let responseObjToAdd: any = {}
            responseObjToAdd = {
                challenge_question_id: challenge_id,
                selected_option: selected_option,
                question: questionAnswered.dataValues.question,
                question_no: questionAnswered.dataValues.question_no
            }

            let user_response: any = {}
            if (challengeRes) {
                user_response = JSON.parse(challengeRes.dataValues.response);
                user_response[questionAnswered.dataValues.challenge_question_id] = responseObjToAdd;
                dataToUpsert["response"] = JSON.stringify(user_response);
                // if (user_id === ) {
                //     one type need to be check if its student then fetch student details and then allow updating based on team_id if same case for teacher
                const resultModel = await this.crudService.update(challengeRes, dataToUpsert, { where: { challenge_id, team_id } })
                if (resultModel instanceof Error) {
                    throw internal(resultModel.message)
                }
                let result: any = {}
                result = resultModel.dataValues
                // }
                return user_response;
            } else {
                user_response[questionAnswered.dataValues.challenge_question_id] = responseObjToAdd;
                // team_id  1, challenge_id = 1, responses = {
                //     q_1: {
                //         question:
                //             selected_pption:
                //     },
                //     q_2: {
                //         question:
                //             selected_options:
                //     }

                // }
                dataToUpsert["response"] = JSON.stringify(user_response);
                dataToUpsert = { ...dataToUpsert, created_by: user_id }

                const resultModel = await this.crudService.create(challenge_response, dataToUpsert)
                if (resultModel instanceof Error) {
                    throw internal(resultModel.message)
                }
                let result: any = {}
                result = resultModel.dataValues
                // result["is_correct"] = responseObjToAdd.is_correct;
                // if(responseObjToAdd.is_correct){
                //     result["msg"] = questionAnswered.dataValues.msg_ans_correct;
                // }else{
                //     result["msg"] = questionAnswered.dataValues.msg_ans_wrong;
                // }
                // result["redirect_to"] = questionAnswered.dataValues.redirect_to;
                return result;
            }

        } catch (err) {
            return err;
        }

    }
    protected async submitResponses(req: Request, res: Response, next: NextFunction) {
        try {
            const challenge_id = req.params.id;
            const { team_id } = req.query;
            const { responses } = req.body;
            const user_id = res.locals.user_id;
            if (!challenge_id) {
                throw badRequest(speeches.CHALLENGE_ID_REQUIRED);
            }
            if (!responses) {
                throw badRequest(speeches.CHALLENGE_QUESTION_ID_REQUIRED);
            }
            if (!team_id) {
                throw unauthorized(speeches.USER_TEAMID_REQUIRED)
            }
            if (!user_id) {
                throw unauthorized(speeches.UNAUTHORIZED_ACCESS);
            }
            const results: any = []
            let result: any = {}
            for (const element of responses) {
                result = await this.insertSingleResponse(team_id, user_id, challenge_id, element.challenge_question_id, element.selected_option)
                if (!result || result instanceof Error) {
                    throw badRequest();
                } else {
                    results.push(result);
                }
            }
            const updateStatus = await this.crudService.update(challenge_response, {
                status: req.body.status,
                sdg: req.body.sdg,
                others: req.body.others
            }, {
                where: {
                    [Op.and]: [
                        { team_id: team_id }
                    ]
                }
            });
            res.status(200).send(dispatcher(res, result))
        } catch (err) {
            next(err)
        }
    }
    protected async initiateIdea(req: Request, res: Response, next: NextFunction) {
        try {
            const challenge_id = req.params.id;
            const { team_id } = req.query;
            const user_id = res.locals.user_id;
            if (!challenge_id) {
                throw badRequest(speeches.CHALLENGE_ID_REQUIRED);
            }
            if (!team_id) {
                throw unauthorized(speeches.USER_TEAMID_REQUIRED)
            }
            if (!user_id) {
                throw unauthorized(speeches.UNAUTHORIZED_ACCESS);
            }
            const challengeRes = await this.crudService.findOne(challenge_response, { where: { challenge_id, team_id } });
            if (challengeRes instanceof Error) {
                throw internal(challengeRes.message)
            }
            if (challengeRes) {
                throw notAcceptable(speeches.DATA_EXIST)
            }
            let dataUpset = {
                sdg: req.body.sdg,
                challenge_id: challenge_id,
                team_id: team_id,
                submitted_by: team_id,
                initiated_by: user_id,
                updated_by: user_id,
                created_by: user_id,
                response: JSON.stringify({})
            }
            let result: any = await this.crudService.create(challenge_response, dataUpset);
            if (!result) {
                throw badRequest(speeches.INVALID_DATA);
            }
            if (result instanceof Error) {
                throw result;
            }
            res.status(200).send(dispatcher(res, result))
        } catch (err) {
            next(err)
        }
    }
    protected async getResponse(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            let user_id = res.locals.user_id;
            let { team_id } = req.query;
            if (!user_id) {
                throw unauthorized(speeches.UNAUTHORIZED_ACCESS)
            }
            if (!team_id) {
                throw unauthorized(speeches.USER_TEAMID_REQUIRED)
            }
            let data: any;
            const { model, id } = req.params;
            const paramStatus: any = req.query.status;
            if (model) {
                this.model = model;
            };
            // pagination
            const { page, size } = req.query;
            let condition: any = {};
            if (team_id) {
                condition.team_id = { [Op.like]: `%${team_id}%` }
            }
            // if (role) {
            //     condition.role = role;
            // }
            const { limit, offset } = this.getPagination(page, size);
            const modelClass = await this.loadModel(model).catch(error => {
                next(error)
            });
            const where: any = {};
            let whereClauseStatusPart: any = {};
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
            }
            if (id) {
                where[`${this.model}_id`] = req.params.id;
                console.log(where)
                data = await this.crudService.findOne(challenge_response, {
                    where: {
                        [Op.and]: [
                            whereClauseStatusPart,
                            where,
                            condition
                        ]
                    },
                    // include: {
                    //     required: false,
                    //     model: challenge_question,
                    // }
                });
            } else {
                // console.log("came here +++> ")
                try {
                    const responseOfFindAndCountAll = await this.crudService.findAndCountAll(challenge_response, {
                        where: {
                            [Op.and]: [
                                whereClauseStatusPart,
                                condition
                            ]
                        },
                        attributes: [
                            "challenge_id",
                            "others",
                            "team_id",
                            "response",
                            "initiated_by",
                            "response",
                            "status",
                            "sdg"
                            // [
                            //     // Note the wrapping parentheses in the call below!
                            //     db.literal(`(
                            //         SELECT CASE WHEN EXISTS 
                            //             (SELECT status 
                            //             FROM quiz_survey_responses as p 
                            //             WHERE p.user_id = ${user_id} 
                            //             AND p.quiz_survey_id = \`quiz_survey\`.\`quiz_survey_id\`) 
                            //         THEN  
                            //             "COMPLETED"
                            //         ELSE 
                            //             '${constents.task_status_flags.default}'
                            //         END as progress
                            //     )`),
                            //     'progress'
                            // ]
                        ],
                        // include: {
                        //     required: false,
                        //     model: challenge_question,
                        // },
                        limit, offset
                    })
                    const result = this.getPagingData(responseOfFindAndCountAll, page, limit);
                    data = result;
                } catch (error: any) {
                    return res.status(500).send(dispatcher(res, data, 'error'))
                }

            }
            // if (!data) {
            //     return res.status(404).send(dispatcher(res,data, 'error'));
            // }
            if (!data || data instanceof Error) {
                if (data != null) {
                    throw notFound(data.message)
                } else {
                    throw notFound()
                }
                res.status(200).send(dispatcher(res, null, "error", speeches.DATA_NOT_FOUND));
                // if(data!=null){
                //     throw 
                (data.message)
                // }else{
                //     throw notFound()
                // }
            }
            data.dataValues.forEach((element: any) => { element.dataValues.response = JSON.parse(element.dataValues.response) })
            return res.status(200).send(dispatcher(res, data, 'success'));
        } catch (error) {
            next(error);
        }
    }
    private async clearResponse(req: Request, res: Response, next: NextFunction) {
        // user_id or email_id will be getting from the params then find the
        try {
            const { team_id } = req.query
            if (!team_id) {
                throw badRequest(speeches.TEAM_NAME_ID)
            };
            const data = await this.crudService.delete(challenge_response, {
                where: {
                    team_id
                }
            })
            if (!data) {
                throw badRequest(data.message)
            };
            if (data instanceof Error) {
                throw data;
            }
            return res.status(200).send(dispatcher(res, data, 'deleted'));
        } catch (error) {
            next(error)
        }
    };

    // protected async getNextQuestion(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    //     const { challenge_id, team_id } = req.params
    //     const paramStatus: any = req.query.status;
    //     //checking for challenge_id and team_id
    //     if (!challenge_id) {
    //         throw badRequest(speeches.CHALLENGE_ID_REQUIRED);
    //     }
    //     if (!team_id) {
    //         throw unauthorized(speeches.UNAUTHORIZED_ACCESS);
    //     }
    //     //check if the given challenge is a valid topic
    //     // const curr_topic = await this.crudService.findOne(course_topic, { where: { "topic_type_id": quiz_id, "topic_type": "QUIZ" } })
    //     // if (!curr_topic || curr_topic instanceof Error) {
    //     //     throw badRequest("INVALID TOPIC");
    //     // }
    //     //
    //     const challengeRes = await this.crudService.findOne(challenge_response, { where: { challenge_id, team_id } });
    //     if (challengeRes instanceof Error) throw internal(challengeRes.message);
    //     let whereClauseStatusPart: any = {}
    //     let boolStatusWhereClauseRequired = false
    //     if (paramStatus && (paramStatus in constents.challenges_flags.list)) {
    //         whereClauseStatusPart = { "status": paramStatus }
    //         boolStatusWhereClauseRequired = true;
    //     }
    //     let question_no = 1
    //     let nextQuestion: any = null;
    //     if (challengeRes) {
    //         //TODO: implement checking response and based on that change the 
    //         let user_response: any = {}
    //         user_response = JSON.parse(challengeRes.dataValues.response);
    //         let questionNosAnsweredArray = Object.keys(user_response);
    //         questionNosAnsweredArray = questionNosAnsweredArray.sort((a, b) => (a > b ? -1 : 1));
    //         const noOfQuestionsAnswered = Object.keys(user_response).length
    //         const lastQuestionAnswered = user_response[questionNosAnsweredArray[0]] //we have assumed that this length will always have at least 1 item ; this could potentially be a source of bug, but is not since this should always be true based on above checks ..
    //         if (lastQuestionAnswered.selected_option == lastQuestionAnswered.correct_answer) {
    //             question_no = lastQuestionAnswered.question_no + 1;
    //         } else {
    //             question_no = lastQuestionAnswered.question_no;
    //             // if (lastQuestionAnswered.level == "HARD") {
    //             //     level = "MEDIUM"
    //             // } else if (lastQuestionAnswered.level == "MEDIUM") {
    //             //     level = "EASY"
    //             // } else if (lastQuestionAnswered.level == "EASY") {
    //             //     question_no = lastQuestionAnswered.question_no + 1;
    //             //     level = "HARD"
    //             // }
    //         }
    //     }
    //     const nextQuestionsToChooseFrom = await this.crudService.findOne(challenge_question, {
    //         where: {
    //             [Op.and]: [
    //                 whereClauseStatusPart,
    //                 { quiz_id: challenge_id },
    //                 // { level: level },
    //                 { question_no: question_no },
    //             ]

    //         }
    //     })
    //     if (nextQuestionsToChooseFrom instanceof Error) {
    //         throw internal(nextQuestionsToChooseFrom.message)
    //     }
    //     if (nextQuestionsToChooseFrom) {
    //         let resultQuestion: any = {}
    //         let optionsArr = []
    //         if (nextQuestionsToChooseFrom.dataValues.option_a) {
    //             optionsArr.push(nextQuestionsToChooseFrom.dataValues.option_a)
    //         }
    //         if (nextQuestionsToChooseFrom.dataValues.option_b) {
    //             optionsArr.push(nextQuestionsToChooseFrom.dataValues.option_b)
    //         }
    //         if (nextQuestionsToChooseFrom.dataValues.option_c) {
    //             optionsArr.push(nextQuestionsToChooseFrom.dataValues.option_c)
    //         }
    //         if (nextQuestionsToChooseFrom.dataValues.option_d) {
    //             optionsArr.push(nextQuestionsToChooseFrom.dataValues.option_d)
    //         }
    //         // resultQuestion["quiz_id"] = nextQuestionsToChooseFrom.dataValues.quiz_id;
    //         // resultQuestion["quiz_question_id"] = nextQuestionsToChooseFrom.dataValues.quiz_question_id;
    //         // resultQuestion["question_no"] = nextQuestionsToChooseFrom.dataValues.question_no;
    //         // resultQuestion["question"] = nextQuestionsToChooseFrom.dataValues.question;
    //         // resultQuestion["question_image"] = nextQuestionsToChooseFrom.dataValues.question_image;
    //         // resultQuestion["question_icon"] = nextQuestionsToChooseFrom.dataValues.question_icon;
    //         // resultQuestion["options"] = optionsArr;
    //         // resultQuestion["level"] = nextQuestionsToChooseFrom.dataValues.level;
    //         // resultQuestion["type"] = nextQuestionsToChooseFrom.dataValues.type;
    //         res.status(200).send(dispatcher(res,resultQuestion))
    //     } else {
    //         //update worksheet topic progress for this user to completed..!!
    //         // if (!boolStatusWhereClauseRequired ||
    //         //     (boolStatusWhereClauseRequired && paramStatus == "ACTIVE")) {
    //         //     const updateProgress = await this.crudService.create(user_topic_progress, { "user_id": user_id, "course_topic_id": curr_topic.course_topic_id, "status": "COMPLETED" })
    //         // }
    //         //send response that quiz is completed..!!
    //         res.status(200).send(dispatcher(res,"Quiz has been completed no more questions to display"))
    //     }
    // }
}
