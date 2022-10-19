import bcrypt from 'bcrypt';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { speeches } from '../configs/speeches.config';
import { baseConfig } from '../configs/base.config';
import { user } from '../models/user.model';
import { mentorSchema, mentorUpdateSchema } from '../validations/mentor.validationa';
import dispatcher from '../utils/dispatch.util';
import authService from '../services/auth.service';
import BaseController from './base.controller';
import ValidationsHolder from '../validations/validationHolder';
import { badRequest, internal } from 'boom';
import { mentor } from '../models/mentor.model';
import { where } from 'sequelize/types';
import { mentor_topic_progress } from '../models/mentor_topic_progress.model';
import { quiz_survey_response } from '../models/quiz_survey_response.model';
import { quiz_response } from '../models/quiz_response.model';
import { team } from '../models/team.model';
import { student } from '../models/student.model';

export default class MentorController extends BaseController {
    model = "mentor";
    authService: authService = new authService;
    private password = process.env.GLOBAL_PASSWORD;

    protected initializePath(): void {
        this.path = '/mentors';
    }
    protected initializeValidations(): void {
        this.validations = new ValidationsHolder(mentorSchema, mentorUpdateSchema);
    }
    protected initializeRoutes(): void {
        //example route to add
        //this.router.get(`${this.path}/`, this.getData);
        this.router.post(`${this.path}/register`, this.register.bind(this));
        this.router.post(`${this.path}/validateOtp`, this.validateOtp.bind(this));
        this.router.post(`${this.path}/login`, this.login.bind(this));
        this.router.get(`${this.path}/logout`, this.logout.bind(this));
        this.router.put(`${this.path}/changePassword`, this.changePassword.bind(this));
        this.router.put(`${this.path}/updatePassword`, this.updatePassword.bind(this));
        this.router.put(`${this.path}/verifyUser`, this.verifyUser.bind(this));
        this.router.put(`${this.path}/updateMobile`, this.updateMobile.bind(this));
        this.router.delete(`${this.path}/:mentor_user_id/deleteAllData`, this.deleteAllData.bind(this));
        this.router.put(`${this.path}/resetPassword`, this.resetPassword.bind(this));
        super.initializeRoutes();
    }
    // TODO: update the register flow by adding a flag called reg_statue in mentor tables
    private async register(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        if (!req.body.organization_code || req.body.organization_code === "") return res.status(406).send(dispatcher(res, speeches.ORG_CODE_REQUIRED, 'error', speeches.NOT_ACCEPTABLE, 406));
        const org = await this.authService.checkOrgDetails(req.body.organization_code);
        if (!org) {
            return res.status(406).send(dispatcher(res, org, 'error', speeches.ORG_CODE_NOT_EXISTS, 406));
        }
        if (!req.body.role || req.body.role !== 'MENTOR') {
            return res.status(406).send(dispatcher(res, null, 'error', speeches.USER_ROLE_REQUIRED, 406));
        }
        req.body['reg_status'] = 1;
        const result: any = await this.authService.mentorRegister(req.body);
        // console.log(result.output.payload.message);
        if (result && result.output && result.output.payload &&  result.output.payload.message == 'Email') {
            return res.status(406).send(dispatcher(res, result.data, 'error', speeches.MENTOR_EXISTS, 406));
        }
        if (result && result.output && result.output.payload && result.output.payload.message == 'Mobile') {
            return res.status(406).send(dispatcher(res, result.data, 'error', speeches.MOBILE_EXISTS, 406));
        }
        // const otp = await this.authService.generateOtp();
        const otp = await this.authService.triggerOtpMsg(req.body.mobile); //async function but no need to await ...since we yet do not care about the outcome of the sms trigger ....!!this may need to change later on ...!!
        const updatePassword = await this.authService.crudService.update(user,
            { password: otp },
            { where: { user_id: result.dataValues.user_id } });
        const data = result.dataValues;
        data['otp'] = otp;
        return res.status(201).send(dispatcher(res, 'data', 'success', speeches.USER_REGISTERED_SUCCESSFULLY, 201));
    }

    // TODO: Update flag reg_status on success validate the OTP
    private async validateOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        const user_res = await this.authService.validatedOTP(req.body);
        if (!user_res) {
            res.status(404).send(dispatcher(res, null, 'error', speeches.OTP_FAIL))
        } else {
            res.status(200).send(dispatcher(res, user_res, 'success', speeches.OTP_FOUND))
        }
    }

    private async login(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        req.body['role'] = 'MENTOR'
        try {
            const result = await this.authService.login(req.body);
            // console.log(result);
            if (!result) {
                return res.status(404).send(dispatcher(res, result, 'error', speeches.USER_NOT_FOUND));
            }
            // else if (result.error) {
            //     return res.status(401).send(dispatcher(res, result.error, 'error', speeches.USER_RISTRICTED, 401));
            // }
            else {
                // mentorDetails = await this.authService.getServiceDetails('mentor', { user_id: result.data.user_id });
                // result.data['mentor_id'] = mentorDetails.dataValues.mentor_id
                const mentorData = await this.authService.crudService.findOne(mentor, { where: { user_id: result.data.user_id } });
                if (!mentorData || mentorData instanceof Error) {
                    return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_REG_STATUS));
                }
                if (mentorData.dataValues.reg_status !== '3') {
                    return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_REG_STATUS));
                }
                result.data['mentor_id'] = mentorData.dataValues.mentor_id;
                return res.status(200).send(dispatcher(res, result.data, 'success', speeches.USER_LOGIN_SUCCESS));
            }
        } catch (error) {
            return res.status(401).send(dispatcher(res, error, 'error', speeches.USER_RISTRICTED, 401));
        }
    }

    private async logout(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        const result = await this.authService.logout(req.body, res);
        if (result.error) {
            next(result.error);
        } else {
            return res.status(200).send(dispatcher(res, speeches.LOGOUT_SUCCESS, 'success'));
        }
    }

    private async changePassword(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        const result = await this.authService.changePassword(req.body, res);
        if (!result) {
            return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
        } else if (result.error) {
            return res.status(404).send(dispatcher(res, result.error, 'error', result.error));
        }
        else if (result.match) {
            return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_PASSWORD));
        } else {
            return res.status(202).send(dispatcher(res, result.data, 'accepted', speeches.USER_PASSWORD_CHANGE, 202));
        }
    }

    //TODO: Update flag reg_status on successful changed password
    private async updatePassword(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        const result = await this.authService.updatePassword(req.body, res);
        if (!result) {
            return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
        } else if (result.error) {
            return res.status(404).send(dispatcher(res, result.error, 'error', result.error));
        }
        else if (result.match) {
            return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_PASSWORD));
        } else {
            return res.status(202).send(dispatcher(res, result.data, 'accepted', speeches.USER_PASSWORD_CHANGE, 202));
        }
    }

    private async verifyUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const mobile = req.body.mobile;
            if (!mobile) {
                throw badRequest(speeches.MOBILE_NUMBER_REQUIRED);
            }
            const result = await this.authService.verifyUser(req.body, res);
            if (!result) {
                return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
            } else if (result.error) {
                return res.status(404).send(dispatcher(res, result.error, 'error', result.error));
            } else {
                return res.status(202).send(dispatcher(res, result.data, 'accepted', speeches.USER_PASSWORD_CHANGE, 202));
            }
        } catch (err) {
            next(err);
        }
    }
    //TODO: ADD API to update the mobile number and trigger OTP,
    private async updateMobile(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { mobile } = req.body;
            if (!mobile) {
                throw badRequest(speeches.MOBILE_NUMBER_REQUIRED);
            }
            const result = await this.authService.mobileUpdate(req.body);
            if (!result) {
                return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
            } else if (result.error) {
                return res.status(404).send(dispatcher(res, result.error, 'error', result.error));
            } else {
                return res.status(202).send(dispatcher(res, result.data, 'accepted', speeches.USER_MOBILE_CHANGE, 202));
            }
        } catch (error) {
            next(error)
        }
    }
    //TODO: test this api and debug and fix any issues in testing if u see any ...!!
    private async deleteAllData(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { mentor_user_id } = req.params;
            // const { mobile } = req.body;
            if (!mentor_user_id) {
                throw badRequest(speeches.USER_USERID_REQUIRED);
            }

            //get mentor details
            const mentorResult: any = await this.crudService.findOne(mentor, { where: { user_id: mentor_user_id } })
            if (!mentorResult) {
                throw internal(speeches.DATA_CORRUPTED)
            }
            if (mentorResult instanceof Error) {
                throw mentorResult
            }

            const deleteMentorResponseResult = await this.authService.bulkDeleteMentorResponse(mentor_user_id)
            if (!deleteMentorResponseResult) {
                throw internal("error while deleting mentor response")
            }
            if (deleteMentorResponseResult instanceof Error) {
                throw deleteMentorResponseResult
            }

            //get team details
            const teamResult: any = await team.findAll({
                attributes: ["team_id"],
                where: { mentor_id: mentor_user_id },
                raw: true
            })
            if (!teamResult) {
                throw internal(speeches.DATA_CORRUPTED)
            }
            if (teamResult instanceof Error) {
                throw teamResult
            }

            const arrayOfteams = teamResult.map((teamSingleresult: any) => {
                return teamSingleresult.team_id;
            })
            // console.log("teamResult",teamResult)
            // console.log("arrayOfteams",arrayOfteams)
            if (arrayOfteams && arrayOfteams.length > 0) {
                const studentUserIds = await student.findAll({
                    where: { team_id: arrayOfteams },
                    raw: true,
                    attributes: ["user_id"]
                })

                if (studentUserIds && !(studentUserIds instanceof Error)) {

                    // console.log("studentUserIds",studentUserIds)
                    const arrayOfStudentuserIds = studentUserIds.map((student) => student.user_id)
                    // console.log("arrayOfStudentuserIds",arrayOfStudentuserIds)

                    for (var i = 0; i < arrayOfStudentuserIds.length; i++) {
                        const deletStudentResponseData = await this.authService.bulkDeleteUserResponse(arrayOfStudentuserIds[i])
                        if (deletStudentResponseData instanceof Error) {
                            throw deletStudentResponseData;
                        }
                    };
                    const resultBulkDeleteStudents = await this.authService.bulkDeleteUserWithStudentDetails(arrayOfStudentuserIds)
                    // console.log("resultBulkDeleteStudents",resultBulkDeleteStudents)
                    // if(!resultBulkDeleteStudents){
                    //     throw internal("error while deleteing students")
                    // }
                    if (resultBulkDeleteStudents instanceof Error) {
                        throw resultBulkDeleteStudents
                    }
                }

                const resultTeamDelete = await this.crudService.delete(team, { where: { team_id: arrayOfteams } })
                // if(!resultTeamDelete){
                //     throw internal("error while deleting team")
                // }
                if (resultTeamDelete instanceof Error) {
                    throw resultTeamDelete
                }
            }
            let resultmentorDelete: any = {};
            resultmentorDelete = await this.authService.bulkDeleteUserWithMentorDetails([mentor_user_id])
            // if(!resultmentorDelete){
            //     throw internal("error while deleting mentor")
            //}
            if (resultmentorDelete instanceof Error) {
                throw resultmentorDelete
            }

            // if (!resultmentorDelete) {
            //     return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
            // } else 
            if (resultmentorDelete.error) {
                return res.status(404).send(dispatcher(res, resultmentorDelete.error, 'error', resultmentorDelete.error));
            } else {
                return res.status(202).send(dispatcher(res, resultmentorDelete.dataValues, 'success', speeches.USER_DELETED, 202));
            }
        } catch (error) {
            next(error)
        }
    }
    private async resetPassword(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { mobile } = req.body;
            if (!mobile) {
                throw badRequest(speeches.MOBILE_NUMBER_REQUIRED);
            }
            const result = await this.authService.mentorResetPassword(req.body);
            if (!result) {
                return res.status(404).send(dispatcher(res, null, 'error', speeches.USER_NOT_FOUND));
            } else if (result.error) {
                return res.status(404).send(dispatcher(res, result.error, 'error', result.error));
            } else {
                return res.status(202).send(dispatcher(res, result.data, 'accepted', speeches.USER_MOBILE_CHANGE, 202));
            }
        } catch (error) {
            next(error)
        }
    }
};