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
import { challengeSchema, challengeUpdateSchema } from "../validations/challenge.validations copy";
import { orderBy } from "lodash";
import { student } from "../models/student.model";
import { forbidden } from "joi";
import path from "path";
import fs from 'fs';
import { S3 } from "aws-sdk";
import { ManagedUpload } from "aws-sdk/clients/s3";
import { challengeResponsesSchema, challengeResponsesUpdateSchema, initiateIdeaSchema, UpdateAnyFieldSchema } from "../validations/challenge_responses.validations";
import StudentService from "../services/students.service";
import { team } from "../models/team.model";
import { mentor } from "../models/mentor.model";
import { organization } from "../models/organization.model";

export default class ChallengeResponsesController extends BaseController {

    model = "challenge_response";

    protected initializePath(): void {
        this.path = '/challenge_response';
    }
    protected initializeValidations(): void {
        this.validations = new ValidationsHolder(challengeResponsesSchema, challengeResponsesUpdateSchema);
    }
    protected initializeRoutes(): void {
        //example route to add 
        // this.router.post(this.path + "/:id/submission/", validationMiddleware(challengeSubmitResponsesSchema), this.submitResponses.bind(this));
        this.router.post(this.path + "/:id/initiate/", validationMiddleware(initiateIdeaSchema), this.initiateIdea.bind(this));
        this.router.post(this.path + "/fileUpload", this.handleAttachment.bind(this));
        this.router.get(this.path + '/submittedDetails', this.getResponse.bind(this));
        this.router.get(this.path + '/fetchRandomChallenge', this.getRandomChallenge.bind(this));
        this.router.put(this.path + '/updateEntry/:id', validationMiddleware(UpdateAnyFieldSchema), this.updateAnyFields.bind(this));
        this.router.get(`${this.path}/clearResponse`, this.clearResponse.bind(this))
        this.router.get(`${this.path}/evaluated/:evaluator_id`, this.getChallengesForEvaluator.bind(this))
        this.router.get(`${this.path}/customFilter/`, this.getChallengesBasedOnFilter.bind(this))
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
            const evaluation_status: any = req.query.evaluation_status;
            const district: any = req.query.district;
            const sdg: any = req.query.sdg;
            const rejected_reason: any = req.query.rejected_reason;
            if (model) {
                this.model = model;
            };
            // pagination
            const { page, size, title } = req.query;
            let condition: any = {};
            if (team_id) {
                condition.team_id = { [Op.like]: `%${team_id}%` }
            }
            const { limit, offset } = this.getPagination(page, size);
            const modelClass = await this.loadModel(model).catch(error => {
                next(error)
            });
            const where: any = {};
            let whereClauseStatusPart: any = {}
            let additionalFilter: any = {};
            let districtFilter: any = {};
            let boolStatusWhereClauseEvaluationStatusRequired = false;
            //status filter
            if (paramStatus && (paramStatus in constents.challenges_flags.list)) {
                if (paramStatus === 'ALL') {
                    whereClauseStatusPart = {};
                    boolStatusWhereClauseEvaluationStatusRequired = false;
                } else {
                    whereClauseStatusPart = { "status": paramStatus };
                    boolStatusWhereClauseEvaluationStatusRequired = true;
                }
            } else {
                whereClauseStatusPart = { "status": "SUBMITTED" };
                boolStatusWhereClauseEvaluationStatusRequired = true;
            };
            //evaluation status filter
            if (evaluation_status) {
                if (evaluation_status in constents.evaluation_status.list) {
                    whereClauseStatusPart = { 'evaluation_status': evaluation_status };
                } else {
                    whereClauseStatusPart['evaluation_status'] = null;
                }
            }
            if (sdg) {
                additionalFilter = sdg && typeof sdg == 'string' ? { sdg } : {}
            }
            if (rejected_reason) {
                additionalFilter = rejected_reason && typeof rejected_reason == 'string' ? { rejected_reason } : {}
            }
            if (district) {
                districtFilter['whereClauseForDistrict'] = district && typeof district == 'string' ? { district } : {}
                districtFilter["liter"] = district ? db.literal('`team->mentor->organization`.`district` = ' + JSON.stringify(district)) : {}
            }
            if (id) {
                where[`${this.model}_id`] = req.params.id;
                // console.log(where)
                data = await this.crudService.findOne(modelClass, {
                    attributes: [
                        "challenge_response_id",
                        "challenge_id",
                        "sdg",
                        "team_id",
                        "response",
                        "initiated_by",
                        "created_at",
                        "submitted_at",
                        "evaluated_by",
                        "evaluated_at",
                        "evaluation_status",
                        "status",
                        "rejected_reason",
                        [
                            db.literal(`(SELECT team_name FROM teams As t WHERE t.team_id = \`challenge_response\`.\`team_id\` )`), 'team_name'
                        ],
                        [
                            db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                        ],
                        [
                            db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`evaluated_by\` )`), 'evaluated_name'
                        ]
                    ],
                    where: {
                        [Op.and]: [
                            where,
                            condition
                        ]
                    }
                });
                data.dataValues.response = JSON.parse(data.dataValues.response);
            } else {
                try {
                    const responseOfFindAndCountAll = await this.crudService.findAndCountAll(modelClass, {
                        attributes: [
                            "challenge_response_id",
                            "challenge_id",
                            "sdg",
                            "team_id",
                            "response",
                            "initiated_by",
                            "created_at",
                            "submitted_at",
                            "evaluated_by",
                            "evaluated_at",
                            "evaluation_status",
                            "status",
                            "rejected_reason",
                            [
                                db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`evaluated_by\` )`), 'evaluated_name'
                            ],
                            [
                                db.literal(`(SELECT team_name FROM teams As t WHERE t.team_id = \`challenge_response\`.\`team_id\` )`), 'team_name'
                            ],
                            [
                                db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                            ],
                        ],
                        where: {
                            [Op.and]: [
                                condition,
                                whereClauseStatusPart,
                                additionalFilter,
                                districtFilter.liter
                            ]
                        },
                        include: {
                            model: team,
                            attributes: [
                                'team_id',
                                'team_name',
                            ],
                            include: {
                                model: mentor,
                                attributes: [
                                    'mentor_id',
                                    'full_name'
                                ],
                                include: {
                                    where: districtFilter.whereClauseForDistrict,
                                    required: false,
                                    model: organization,
                                    attributes: [
                                        "district"
                                    ]
                                }
                            }
                        },
                        limit, offset,
                    })
                    console.log(responseOfFindAndCountAll);
                    const result = this.getPagingData(responseOfFindAndCountAll, page, limit);
                    data = result;
                } catch (error: any) {
                    return res.status(500).send(dispatcher(res, data, 'error'))
                }
                data.dataValues.forEach((element: any) => { element.dataValues.response = JSON.parse(element.dataValues.response) })
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
    };
    protected async getRandomChallenge(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            let challengeResponse: any;
            let evaluator_id: any;
            let where: any = {};
            let whereClauseStatusPart: any = {}

            let user_id = res.locals.user_id;
            if (!user_id) throw unauthorized(speeches.UNAUTHORIZED_ACCESS);

            let evaluator_user_id = req.query.evaluator_user_id;
            if (!evaluator_user_id) throw unauthorized(speeches.ID_REQUIRED);

            const paramStatus: any = req.query.status;
            let boolStatusWhereClauseRequired = false;

            if (paramStatus && (paramStatus in constents.challenges_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus };
                boolStatusWhereClauseRequired = true;
            } else {
                whereClauseStatusPart = { "status": "DRAFT" };
                boolStatusWhereClauseRequired = true;
            };
            evaluator_id = { evaluated_by: evaluator_user_id }
            challengeResponse = await this.crudService.findOne(challenge_response, {
                attributes: [
                    `challenge_response_id`,
                    `challenge_id`,
                    `others`,
                    `sdg`,
                    `team_id`,
                    `response`,
                    `initiated_by`,
                    "created_at",
                    "submitted_at",
                    `status`,
                    [
                        db.literal(`( SELECT count(*) FROM challenge_responses as idea where idea.evaluation_status is null AND idea.status = 'SUBMITTED')`),
                        'openIdeas'
                    ],
                    [
                        db.literal(`(SELECT count(*) FROM challenge_responses as idea where idea.evaluated_by = ${evaluator_user_id.toString()})`), 'evaluatedIdeas'
                    ],
                ],
                where: {
                    [Op.and]: [
                        whereClauseStatusPart,
                        { evaluation_status: null }
                    ]
                },
                order: db.literal('rand()'), limit: 1
            });
            if (challengeResponse instanceof Error) {
                throw challengeResponse
            }
            if (!challengeResponse) {
                throw notFound("All challenge has been accepted, no more challenge to display");
            };
            challengeResponse.dataValues.response = JSON.parse(challengeResponse.dataValues.response)
            return res.status(200).send(dispatcher(res, challengeResponse, 'success'));
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
            // const studentDetailsBasedOnTeam = await this.crudService.findAll(student, { where: { team_id } });
            // if (studentDetailsBasedOnTeam instanceof Error) {
            //     throw internal(studentDetailsBasedOnTeam.message)
            // };
            // console.log(studentDetailsBasedOnTeam.length);
            let dataToUpsert: any = {}
            dataToUpsert = { challenge_id, team_id, updated_by: user_id }
            let responseObjToAdd: any = {}
            responseObjToAdd = {
                challenge_question_id: questionAnswered.challenge_question_id,
                selected_option: selected_option,
                question: questionAnswered.dataValues.question,
                word_limit: questionAnswered.dataValues.word_limit,
                question_type: questionAnswered.dataValues.type,
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
                dataToUpsert = { ...dataToUpsert }
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
    protected async createData(req: Request, res: Response, next: NextFunction) {
        try {
            const { challenge_id, team_id } = req.query;
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
            let result: any = {};
            for (const element of responses) {
                let selected_option = Array.isArray(element.selected_option) ? element.selected_option.join("{{}}") : element.selected_option;
                selected_option = res.locals.translationService.getTranslationKey(selected_option).split("{{}}");
                result = await this.insertSingleResponse(team_id, user_id, challenge_id, element.challenge_question_id, selected_option)
                if (!result || result instanceof Error) {
                    throw badRequest();
                } else {
                    results.push(result);
                }
            }

            let newDate = new Date();
            let newFormat = (newDate.getFullYear()) + "-" + (1 + newDate.getMonth()) + "-" + newDate.getUTCDate() + ' ' + newDate.getHours() + ':' + newDate.getMinutes() + ':' + newDate.getSeconds();
            const updateStatus = await this.crudService.update(challenge_response, {
                status: req.body.status,
                sdg: req.body.sdg,
                others: req.body.others,
                submitted_at: req.body.status == "SUBMITTED" ? newFormat.trim() : null
            }, {
                where: {
                    [Op.and]: [
                        { team_id: team_id }
                    ]
                }
            });
            if (req.body.status == "SUBMITTED") {
                const findingTheStudentsBasedOnTeamId = await this.crudService.findAll(student, {
                    where: { team_id },
                    attributes: [
                        'badges',
                        'student_id'
                    ]
                });
                let studentBadgesObj: any = {}
                let studentBadgesObjForNull: any = {}
                findingTheStudentsBasedOnTeamId.forEach(async (s: any) => {
                    if (!s.dataValues.badges) {
                        studentBadgesObjForNull["the_change_maker"] = {
                            completed_date: (new Date())
                        }
                        const studentBadgesObjForNullJson = JSON.stringify(studentBadgesObjForNull)
                        await student.update({ badges: studentBadgesObjForNullJson }, {
                            where: {
                                student_id: s.dataValues.student_id
                            }
                        })
                    } else {
                        studentBadgesObj = JSON.parse(s.dataValues.badges);
                        studentBadgesObj["the_change_maker"] = {
                            completed_date: (new Date())
                        }
                        const studentBadgesObjJson = JSON.stringify(studentBadgesObj)
                        await student.update({ badges: studentBadgesObjJson }, {
                            where: {
                                student_id: s.dataValues.student_id
                            }
                        })
                    }
                });
            }
            res.status(200).send(dispatcher(res, result))
        } catch (err) {
            next(err)
        }
    }
    protected async updateData(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { model, id } = req.params;
            if (model) {
                this.model = model;
            };

            // redirecting status field to evaluater_status field and removing status from the request body;
            req.body['evaluation_status'] = req.body.status;
            delete req.body.status;

            //date format 
            let newDate = new Date();
            let newFormat = (newDate.getFullYear()) + "-" + (1 + newDate.getMonth()) + "-" + newDate.getUTCDate() + ' ' + newDate.getHours() + ':' + newDate.getMinutes() + ':' + newDate.getSeconds();

            const user_id = res.locals.user_id
            const where: any = {};
            where[`${this.model}_id`] = req.params.id;
            const modelLoaded = await this.loadModel(model);
            const payload = this.autoFillTrackingColumns(req, res, modelLoaded);
            payload['evaluated_by'] = user_id
            payload['evaluated_at'] = newFormat.trim();
            const data = await this.crudService.update(modelLoaded, payload, { where: where });
            if (!data) {
                throw badRequest()
            }
            if (data instanceof Error) {
                throw data;
            }
            return res.status(200).send(dispatcher(res, data, 'updated'));
        } catch (error) {
            next(error);
        }
    };
    protected async updateAnyFields(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { model, id } = req.params;
            if (model) {
                this.model = model;
            };
            const user_id = res.locals.user_id
            const where: any = {};
            where[`${this.model}_id`] = req.params.id;
            const modelLoaded = await this.loadModel(model);
            const payload = this.autoFillTrackingColumns(req, res, modelLoaded);
            const data = await this.crudService.update(modelLoaded, payload, { where: where });
            if (!data) {
                throw badRequest()
            }
            if (data instanceof Error) {
                throw data;
            }
            return res.status(200).send(dispatcher(res, data, 'updated'));
        } catch (error) {
            next(error);
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
            const challengeRes = await this.crudService.findOne(challenge_response, {
                attributes: [
                    [
                        db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_by'
                    ],
                    "created_at",
                    "sdg"
                ],
                where: { challenge_id, team_id }
            });
            if (challengeRes instanceof Error) {
                throw internal(challengeRes.message)
            }
            if (challengeRes) {
                return res.status(406).send(dispatcher(res, challengeRes, 'error', speeches.DATA_EXIST))
            }
            let dataUpset = {
                sdg: req.body.sdg,
                challenge_id: challenge_id,
                team_id: team_id,
                initiated_by: user_id,
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
    protected async handleAttachment(req: Request, res: Response, next: NextFunction) {
        try {
            const { team_id } = req.query;
            const rawfiles: any = req.files;
            const files: any = Object.values(rawfiles);
            const errs: any = [];
            let attachments: any = [];
            let result: any = {};
            let file_name_prefix: any;
            let s3 = new S3({
                apiVersion: '2006-03-01',
                region: process.env.AWS_REGION,
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            });
            if (!req.files) {
                return result;
            }
            if (process.env.DB_HOST == "ls-ea6dc83d3df52f512dfbfa20261768bab79a69a4.chen5dyzmtrc.ap-south-1.rds.amazonaws.com") {
                file_name_prefix = `ideas/stage/${team_id}`
            } else {
                file_name_prefix = `ideas/${team_id}`
            }
            for (const file_name of Object.keys(files)) {
                const file = files[file_name];
                const readFile: any = await fs.readFileSync(file.path);
                if (readFile instanceof Error) {
                    errs.push(`Error uploading file: ${file.originalFilename} err: ${readFile}`)
                }
                file.originalFilename = `${file_name_prefix}/${file.originalFilename}`;
                let params = {
                    Bucket: 'unisole-assets',
                    Key: file.originalFilename,
                    Body: readFile
                };
                await s3.upload(params).promise()
                    .then((data: any) => { attachments.push(data.Location) })
                    .catch((err: any) => { errs.push(`Error uploading file: ${file.originalFilename}, err: ${err.message}`) })
                result['attachments'] = attachments;
                result['errors'] = errs;
            }
            res.status(200).send(dispatcher(res, result));
        } catch (err) {
            next(err)
        }
    }
    protected async getResponse(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            console.log(Date.now);
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
            if (model) {
                this.model = model;
            };
            // pagination
            const { page, size } = req.query;
            let condition: any = {};
            if (team_id) {
                condition.team_id = team_id
            }
            const { limit, offset } = this.getPagination(page, size);
            const modelClass = await this.loadModel(model).catch(error => {
                next(error)
            });
            const where: any = {};
            if (id) {
                where[`${this.model}_id`] = req.params.id;
                console.log(where)
                data = await this.crudService.findOne(challenge_response, {
                    attributes: [
                        [
                            db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                        ],
                        "created_by",
                        "updated_by",
                        "created_at",
                        "updated_at",
                        "initiated_by",
                        "submitted_at",
                        "sdg",
                        "responses",
                        "team_id",
                        "challenge_id",
                        "status",
                        "others",
                        "evaluation_status"
                    ],
                    where: {
                        [Op.and]: [
                            where,
                            condition
                        ]
                    },
                });
            } else {
                try {
                    const responseOfFindAndCountAll = await this.crudService.findAndCountAll(challenge_response, {
                        where: {
                            [Op.and]: [
                                condition
                            ]
                        },
                        attributes: [
                            [
                                db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                            ],
                            "initiated_by",
                            "created_at",
                            "updated_at",
                            "challenge_id",
                            "submitted_at",
                            "challenge_response_id",
                            "others",
                            "team_id",
                            "response",
                            "status",
                            "sdg",
                            "evaluation_status"
                        ],
                        limit, offset
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
            }
            data.dataValues.forEach((element: any) => { element.dataValues.response = JSON.parse(element.dataValues.response) })
            return res.status(200).send(dispatcher(res, data, 'success'));
        } catch (error) {
            next(error);
        }
    }
    private async clearResponse(req: Request, res: Response, next: NextFunction) {
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
    private async getChallengesForEvaluator(req: Request, res: Response, next: NextFunction) {
        try {
            let whereClauseEvaluationStatus: any = {};
            let additionalFilter: any = {};
            let districtFilter: any = {};
            const evaluator_id: any = req.params.evaluator_id
            const evaluation_status: any = req.query.evaluation_status;
            const district: any = req.query.district;
            const sdg: any = req.query.sdg;
            const rejected_reason: any = req.query.rejected_reason;
            if (!evaluator_id) {
                throw badRequest(speeches.TEAM_NAME_ID)
            };
            if (evaluation_status) {
                if (evaluation_status in constents.evaluation_status.list) {
                    whereClauseEvaluationStatus = { 'evaluation_status': evaluation_status };
                } else {
                    whereClauseEvaluationStatus['evaluation_status'] = null;
                }
            }
            if (sdg) {
                additionalFilter = sdg && typeof sdg == 'string' ? { sdg } : {}
            }
            if (rejected_reason) {
                additionalFilter = rejected_reason && typeof rejected_reason == 'string' ? { rejected_reason } : {}
            }
            if (district) {
                districtFilter['whereClauseForDistrict'] = district && typeof district == 'string' ? { district } : {}
                districtFilter["liter"] = district ? db.literal('`team->mentor->organization`.`district` = ' + JSON.stringify(district)) : {}
            }
            // districtFilter['district'] = district && typeof district == 'string' ? district : `%%`
            // additionalFilter['sdg'] = { [Op.like]: sdg && typeof sdg == 'string' ? sdg : `%%` }
            // additionalFilter['rejected_reason'] = { [Op.like]: rejected_reason && typeof rejected_reason == 'string' ? rejected_reason : `%%` }
            const data = await this.crudService.findAll(challenge_response, {
                attributes: [
                    "challenge_response_id",
                    "team_id",
                    "initiated_by",
                    "status",
                    "evaluated_by",
                    "evaluated_at",
                    "submitted_at",
                    "evaluation_status",
                    "rejected_reason",
                    "sdg",
                    "response",
                    [
                        db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                    ],
                    [
                        db.literal(`(SELECT team_name FROM teams As t WHERE t.team_id = \`challenge_response\`.\`team_id\` )`), 'team_name'
                    ],
                ],
                where: {
                    [Op.and]: [
                        { evaluated_by: evaluator_id },
                        whereClauseEvaluationStatus,
                        additionalFilter,
                        districtFilter.liter
                    ]
                },
                include: {
                    model: team,
                    attributes: [
                        'team_id',
                        'team_name',
                    ],
                    include: {
                        model: mentor,
                        attributes: [
                            'mentor_id',
                            'full_name'
                        ],
                        include: {
                            where: districtFilter.whereClauseForDistrict,
                            required: false,
                            model: organization,
                            attributes: [
                                "district"
                            ]
                        }
                    }
                }
            });
            if (!data) {
                throw badRequest(data.message)
            };
            if (data instanceof Error) {
                throw data;
            }
            data.forEach((element: any) => { element.dataValues.response = JSON.parse(element.dataValues.response) })
            return res.status(200).send(dispatcher(res, data, 'success'));
        } catch (error) {
            next(error)
        }
    };
    private async getChallengesBasedOnFilter(req: Request, res: Response, next: NextFunction) {
        try {
            const { district, sdg } = req.query
            let whereClauseOfDistrict: any = {}
            let whereClauseOfSdg: any = {}
            if (district) {
                whereClauseOfDistrict['whereClause'] = district && typeof district == 'string' ? { district } : {}
                whereClauseOfDistrict["liter"] = district ? db.literal('`team->mentor->organization`.`district` = ' + JSON.stringify(district)) : {}
            }
            if (sdg) {
                whereClauseOfSdg = sdg && typeof sdg == 'string' ? { sdg } : {}
            }
            // whereClauseOfSdg['sdg'] = { [Op.like]: sdg && typeof district == 'string' ? sdg : `%%` }
            const data = await this.crudService.findAll(challenge_response, {
                    attributes: [
                        "challenge_response_id",
                        "challenge_id",
                        "initiated_by",
                        "status",
                        "evaluated_by",
                        "evaluated_at",
                        "submitted_at",
                        "evaluation_status",
                        "rejected_reason",
                        "sdg",
                        "response",
                        [
                            db.literal(`(SELECT full_name FROM users As s WHERE s.user_id = \`challenge_response\`.\`initiated_by\` )`), 'initiated_name'
                        ]
                    ],
                    where: {
                        [Op.and]: [
                            whereClauseOfSdg,
                            whereClauseOfDistrict.liter
                        ]
                    },
                    include: {
                        model: team,
                        attributes: [
                            'team_id',
                            'team_name',
                        ],
                        include: {
                            model: mentor,
                            attributes: [
                                'mentor_id',
                                'full_name'
                            ],
                            include: {
                                where: whereClauseOfDistrict.whereClause,
                                required: false,
                                model: organization,
                                attributes: [
                                    "district"
                                ]
                            }
                        }
                    }
                });
                if(!data) {
                    throw badRequest(data.message)
                };
                if(data instanceof Error) {
                throw data;
            }
            data.forEach((element: any) => { element.dataValues.response = JSON.parse(element.dataValues.response) })
            return res.status(200).send(dispatcher(res, data, 'success'));
        } catch (error) {
            next(error)
        }
    };
}