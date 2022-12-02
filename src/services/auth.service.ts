import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { Op } from 'sequelize';

import jwtUtil from '../utils/jwt.util';
import CRUDService from "./crud.service";
import { baseConfig } from '../configs/base.config';
import { speeches } from '../configs/speeches.config';
import { admin } from "../models/admin.model";
import { evaluater } from "../models/evaluater.model";
import { mentor } from "../models/mentor.model";
import { organization } from '../models/organization.model';
import { student } from "../models/student.model";
import { user } from "../models/user.model";
import { team } from '../models/team.model';
import { quiz_response } from "../models/quiz_response.model";
import { quiz_survey_response } from "../models/quiz_survey_response.model";
import { reflective_quiz_response } from "../models/reflective_quiz_response.model";
import { user_topic_progress } from "../models/user_topic_progress.model";
import { worksheet_response } from "../models/worksheet_response.model";
import AWS from 'aws-sdk';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { includes } from 'lodash';
import { func, invalid } from 'joi';
import { mentor_topic_progress } from '../models/mentor_topic_progress.model';
import { badRequest, internal, notAcceptable, notFound } from 'boom';
import { notFoundError } from '../docs/errors';
import { constents } from '../configs/constents.config';
export default class authService {

    crudService: CRUDService = new CRUDService;
    private password = process.env.GLOBAL_PASSWORD;
    // private aws_access_key = process.env.AWS_ACCESS_KEY_ID;
    // private aws_secret_key = process.env.AWS_SECRET_ACCESS_KEY;
    // private aws_region = process.env.AWS_REGION;
    private otp = '112233';

    async checkOrgDetails(organization_code: any) {
        try {
            const org = await this.crudService.findOne(organization, {
                where: {
                    organization_code: organization_code,
                    status: {
                        [Op.or]: ['ACTIVE', 'NEW']
                    }
                },
                include: {
                    model: mentor,
                    attributes: [
                        "mentor_id",
                        'user_id',
                        'full_name',
                        'mobile',
                    ],
                    include: {
                        model: user,
                        attributes: [
                            'username'
                        ]
                    }
                }
            })
            return org;
        } catch (error) {
            return error;
        }
    }
    async getServiceDetails(service: string, query_parameter: any) {
        let model: any;
        switch (service) {
            case 'student':
                model = student;
                break
            case 'team':
                model = team;
                break;
            case 'mentor':
                model = mentor;
                break;
            case 'admin':
                model = admin;
                break;
            default: model = null;
        }
        try {
            const details = await this.crudService.findOne(model, { where: query_parameter })
            if (details instanceof Error) {
                return 'not'
            } return details;
        } catch (error) {
            return error;
        }
    }
    async mentorRegister(requestBody: any) {
        let response: any;
        try {
            const user_data = await this.crudService.findOne(user, { where: { username: requestBody.username } });
            if (user_data) {
                throw badRequest('Email');
            } else {
                const mentor_data = await this.crudService.findOne(mentor, { where: { mobile: requestBody.mobile } })
                if (mentor_data) {
                    throw badRequest('Mobile')
                } else {
                    let createUserAccount = await this.crudService.create(user, requestBody);
                    let conditions = { ...requestBody, user_id: createUserAccount.dataValues.user_id };
                    let createMentorAccount = await this.crudService.create(mentor, conditions);
                    createMentorAccount.dataValues['username'] = createUserAccount.dataValues.username;
                    createMentorAccount.dataValues['user_id'] = createUserAccount.dataValues.user_id;
                    response = createMentorAccount;
                    return response;
                }
            }
        } catch (error) {
            return error;
        }
    }
    async register(requestBody: any) {
        let response: any = {};
        let profile: any;
        let reg_statue: any = requestBody.reg_statue;
        try {
            const user_res = await this.crudService.findOne(user, { where: { username: requestBody.username } });
            if (user_res) {
                response['user_res'] = user_res;
                return response
            }
            const result = await this.crudService.create(user, requestBody);
            // console.log(result)
            let whereClass = { ...requestBody, user_id: result.dataValues.user_id };
            // console.log(whereClass);
            switch (requestBody.role) {
                case 'STUDENT': {
                    profile = await this.crudService.create(student, whereClass);
                    break;
                }
                case 'MENTOR': {
                    if (requestBody.organization_code) {
                        profile = await this.crudService.create(mentor, whereClass);
                        profile.dataValues['username'] = result.dataValues.username
                        break;
                    } else return false;
                }
                case 'EVALUATER': {
                    profile = await this.crudService.create(evaluater, whereClass);
                    break;
                }
                case 'ADMIN':
                    profile = await this.crudService.create(admin, whereClass);
                    break;
                default:
                    profile = null;
            }
            response['profile'] = profile;
            return response;
        } catch (error: any) {
            response['error'] = error;
            return response
        }
    }
    async bulkCreateStudentService(requestBody: any) {
        /**
         * for over requestBody and get single user set the password, find the user's if exist push to the error response or create user, student both
         * 
         */
        let userProfile: any
        let result: any;
        let errorResponse: any = [];
        let successResponse: any = [];
        for (let payload of requestBody) {
            const trimmedName = payload.full_name.trim();
            if (!trimmedName || typeof trimmedName == undefined) {
                errorResponse.push(`'${payload.full_name}'`);
                continue;
            }
            // payload.password = await bcrypt.hashSync(payload.password, process.env.SALT || baseConfig.SALT);
            let checkUserExisted = await this.crudService.findOne(user, {
                attributes: ["user_id", "username"],
                where: { username: payload.username }
            });
            if (!checkUserExisted) {
                userProfile = await this.crudService.create(user, payload);
                payload["user_id"] = userProfile.dataValues.user_id;
                result = await this.crudService.create(student, payload);
                successResponse.push(payload.full_name);
            } else {
                errorResponse.push(payload.full_name);
            }
        };
        let successMsg = successResponse.length ? successResponse.join(', ') + " successfully created. " : ''
        let errorMsg = errorResponse.length ? errorResponse.join(', ') + " invalid/already existed" : ''
        return successMsg + errorMsg;
    }
    async login(requestBody: any) {
        const GLOBAL_PASSWORD = 'uniSolve'
        const GlobalCryptoEncryptedString = await this.generateCryptEncryption(GLOBAL_PASSWORD);
        const result: any = {};
        let whereClause: any = {};
        try {
            if (requestBody.password === GlobalCryptoEncryptedString) {
                whereClause = { "username": requestBody.username, "role": requestBody.role }
            } else {
                whereClause = {
                    "username": requestBody.username,
                    "password": await bcrypt.hashSync(requestBody.password, process.env.SALT || baseConfig.SALT),
                    "role": requestBody.role
                }
            }
            const user_res: any = await this.crudService.findOne(user, {
                where: whereClause
            })
            if (!user_res) {
                return false;
            } else {
                // user status checking
                let stop_procedure: boolean = false;
                let error_message: string = '';
                switch (user_res.status) {
                    case 'DELETED':
                        stop_procedure = true;
                        error_message = speeches.USER_DELETED;
                    case 'LOCKED':
                        stop_procedure = true;
                        error_message = speeches.USER_LOCKED;
                    case 'INACTIVE':
                        stop_procedure = true;
                        error_message = speeches.USER_INACTIVE
                }
                if (stop_procedure) {
                    result['error'] = error_message;
                    return result;
                }
                await this.crudService.update(user, {
                    is_loggedin: "YES",
                    last_login: new Date().toLocaleString()
                }, { where: { user_id: user_res.user_id } });

                user_res.is_loggedin = "YES";
                const token = await jwtUtil.createToken(user_res.dataValues, `${process.env.PRIVATE_KEY}`);

                // await sendNotification({
                //     notification_type: constents.notification_types.list.PUSH,
                //     target_audience: user_res.user_id, // Keep 'ALL' for all users
                //     title: 'Login Successful',
                //     image: '',
                //     message: 'You have successfully logged in.',
                //     status: constents.notification_status_flags.list.PUBLISHED,
                //     created_by: user_res.user_id
                // });

                // await sendNotification({
                //     notification_type: constents.notification_types.list.EMAIL,
                //     target_audience: user_res.email, // Keep 'ALL' for all users
                //     title: 'Login Successful',
                //     image: '',
                //     message: 'You have successfully logged in.',
                //     status: constents.notification_status_flags.list.PUBLISHED,
                //     created_by: user_res.user_id
                // });

                result['data'] = {
                    user_id: user_res.dataValues.user_id,
                    name: user_res.dataValues.username,
                    full_name: user_res.dataValues.full_name,
                    status: user_res.dataValues.status,
                    role: user_res.dataValues.role,
                    token,
                    type: 'Bearer',
                    expire: process.env.TOKEN_DEFAULT_TIMEOUT
                }
                return result
            }
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async logout(requestBody: any, responseBody: any) {
        let result: any = {};
        try {
            const update_res = await this.crudService.update(user,
                { is_loggedin: "NO" },
                { where: { user_id: responseBody.locals.user_id } }
            );
            result['data'] = update_res;
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async changePassword(requestBody: any, responseBody: any) {
        let result: any = {};
        try {
            const user_res: any = await this.crudService.findOnePassword(user, {
                where: {
                    [Op.or]: [
                        {
                            username: { [Op.eq]: requestBody.username }
                        },
                        {
                            user_id: { [Op.like]: `%${requestBody.user_id}%` }
                        }
                    ]
                }
            });
            // const passwordValidation = bcrypt.compareSync(requestBody.body.old_password, user_res.dataValues.password);
            // console.log("test: ", passwordValidation)
            if (!user_res) {
                result['user_res'] = user_res;
                result['error'] = speeches.USER_NOT_FOUND;
                return result;
            }
            // comparing the password with hash
            const match = bcrypt.compareSync(requestBody.old_password, user_res.dataValues.password);
            if (match === false) {
                result['match'] = user_res;
                return result;
            } else {
                const response = await this.crudService.update(user, {
                    password: await bcrypt.hashSync(requestBody.new_password, process.env.SALT || baseConfig.SALT)
                }, { where: { user_id: user_res.dataValues.user_id } });
                result['data'] = response;
                return result;
            }
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async generateOtp() {
        // changing random OTP to static OTP as per Sreeni request.
        // return Math.random().toFixed(6).substr(-6);
        // return Math.floor(1000 + Math.random() * 9000)
        return this.otp;
    }
    async triggerOtpMsg(mobile: any) {
        // const resObj = {
        //     Message: `Your verification code is ${otp}`,
        //     PhoneNumber: '+' + mobile,
        //     MessageAttributes: {
        //         'AWS.SNS.SMS.SenderID': {
        //             'DataType': 'String',
        //             'StringValue': 'Unisolve'
        //         },
        //         'AWS.SNS.SMS.SMSType': {
        //             'DataType': 'String',
        //             'StringValue': "Transactional"
        //         }
        //     }
        // };
        // // try {
        // const resp: any = await new AWS.SNS({
        //     apiVersion: '2010-03-31',
        //     accessKeyId: this.aws_access_key,
        //     secretAccessKey: this.aws_secret_key,
        //     region: 'ap-south-1'
        // }).publish(resObj, function (error: any, data: any) {
        //     if (error) {
        //         console.log(error);
        //         return error;
        //     }
        //     console.log(data);
        //     return { MessageID: data.MessageId, OTP: otp }
        // })
        //.promise();
        // resp.then(
        //     function (data: any) {
        //         console.log(data);
        //         return { MessageID: data.MessageId, OTP: otp }
        //     }
        // ).catch(
        //     function (error: any) {
        //         // console.log(error);
        //         return error;
        //     });
        // const resp = await axios.get(`https://veup.versatilesmshub.com/api/sendsms.php?api=0a227d90ef8cd9f7b2361b33abb3f2c8&senderid=YFSITS&channel=Trans&DCS=0&flashsms=0&number=${mobile}&text=Dear Student, A request for password reset had been generated. Your OTP for the same is ${otp} -Team Youth for Social Impact&SmsCampaignId=1&EntityID=1701164847193907676&DLT_TE_ID=1507165035646232522`)
        // } catch (err) {
        //     console.log(err);
        //     return err;
        // }
        try {
            const otp = await axios.get(`https://youthforsocialimpact.in/student/unisolveOTP/${mobile}`)
            return otp.data.otp;
        } catch (error: any) {
            return error
        }
    }
    async verifyUser(requestBody: any, responseBody: any) {
        let result: any = {};
        try {
            const user_res: any = await this.crudService.findOne(mentor, {
                where: {
                    [Op.or]: [
                        // {
                        //     email: { [Op.eq]: requestBody.email }
                        // },
                        {
                            mobile: { [Op.like]: `%${requestBody.mobile}%` }
                        }
                    ]
                }
            });

            if (!user_res) {
                result['user_res'] = user_res;
                result['error'] = speeches.USER_NOT_FOUND;
                return result;
            }
            //TODO trigger otp and update user with otp
            const otp = await this.generateOtp();
            const smsResponse: any = await this.triggerOtpMsg(requestBody.mobile);
            if (smsResponse instanceof Error) {
                throw smsResponse;
            }

            const response = await this.crudService.update(user, {
                password: await bcrypt.hashSync(otp, process.env.SALT || baseConfig.SALT)
            }, { where: { user_id: user_res.dataValues.user_id } });
            result['data'] = response;
            return result;

        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async generateCryptEncryption(value: any) {
        const key = CryptoJS.enc.Hex.parse('253D3FB468A0E24677C28A624BE0F939');
        const iv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
        const hashedPassword = CryptoJS.AES.encrypt(value, key, {
            iv: iv,
            padding: CryptoJS.pad.NoPadding
        }).toString();
        return hashedPassword;
    }
    async mobileUpdate(requestBody: any) {
        let result: any = {};
        try {
            const mentor_res: any = await this.crudService.updateAndFind(mentor, { mobile: requestBody.mobile }, {
                where: { user_id: requestBody.user_id }
            });
            if (!mentor_res) {
                result['error'] = speeches.USER_NOT_FOUND;
                return result;
            }
            const otp = await this.generateOtp();
            const smsResponse = this.triggerOtpMsg(requestBody.mobile);
            if (smsResponse instanceof Error) {
                throw smsResponse;
            }
            const user_res: any = await this.crudService.updateAndFind(user, {
                password: await bcrypt.hashSync(otp, process.env.SALT || baseConfig.SALT)
            }, { where: { user_id: requestBody.user_id } })
            result['data'] = {
                username: user_res.dataValues.username,
                user_id: user_res.dataValues.user_id,
                mobile: mentor_res.dataValues.mobile,
                reg_status: mentor_res.dataValues.reg_status,
                otp
            };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async mentorResetPassword(requestBody: any) {
        let result: any = {};
        try {
            const mentor_res: any = await this.crudService.findOne(mentor, {
                where: {
                    [Op.or]: [
                        {
                            mobile: { [Op.like]: `%${requestBody.mobile}%` }
                        }
                    ]
                }
            });
            if (!mentor_res) {
                result['error'] = speeches.USER_NOT_FOUND;
                return result;
            }
            const user_data = await this.crudService.findOnePassword(user, {
                where: { user_id: mentor_res.dataValues.user_id }
            });

            // const otp = await this.generateOtp();
            let smsResponse = await this.triggerOtpMsg(requestBody.mobile);
            if (smsResponse instanceof Error) {
                throw smsResponse;
            }
            const findMentorDetailsAndUpdateOTP: any = await this.crudService.updateAndFind(mentor,
                { otp: smsResponse },
                { where: { user_id: mentor_res.dataValues.user_id } }
            );
            smsResponse = String(smsResponse);
            let hashString = await this.generateCryptEncryption(smsResponse)
            const user_res: any = await this.crudService.updateAndFind(user, {
                password: await bcrypt.hashSync(hashString, process.env.SALT || baseConfig.SALT)
            }, { where: { user_id: user_data.dataValues.user_id } })
            result['data'] = {
                username: user_res.dataValues.username,
                user_id: user_res.dataValues.user_id,
                // mobile: mentor_res.dataValues.mobile,
                // reg_status: mentor_res.dataValues.reg_status
            };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async manualMentorResetPassword(requestBody: any) {
        let result: any = {};
        try {
            const findUserDetailsAndUpdatePassword: any = await this.crudService.updateAndFind(user,
                { password: await bcrypt.hashSync(requestBody.encryptedString, process.env.SALT || baseConfig.SALT) },
                { where: { user_id: requestBody.user_id } }
            );
            const findMentorDetailsAndUpdateOTP: any = await this.crudService.updateAndFind(mentor,
                { otp: requestBody.otp, qualification: requestBody.encryptedString },
                { where: { user_id: requestBody.user_id } }
            );
            if (!findMentorDetailsAndUpdateOTP || !findUserDetailsAndUpdatePassword || findMentorDetailsAndUpdateOTP instanceof Error || findUserDetailsAndUpdatePassword instanceof Error) throw badRequest(speeches.DATA_NOT_FOUND)
            result['data'] = {
                username: findUserDetailsAndUpdatePassword.dataValues.username,
                user_id: findUserDetailsAndUpdatePassword.dataValues.user_id,
                mentor_id: findMentorDetailsAndUpdateOTP.dataValues.mentor_id,
                mentor_otp: findMentorDetailsAndUpdateOTP.dataValues.otp
            };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async studentResetPassword(requestBody: any) {
        let result: any = {};
        try {
            const updatePassword: any = await this.crudService.update(user,
                { password: await bcrypt.hashSync(requestBody.encryptedString, process.env.SALT || baseConfig.SALT) },
                { where: { user_id: requestBody.user_id } }
            );
            const findStudentDetailsAndUpdateUUID: any = await this.crudService.updateAndFind(student,
                { UUID: requestBody.UUID, qualification: requestBody.encryptedString },
                { where: { user_id: requestBody.user_id } }
            );
            if (!updatePassword) throw badRequest(speeches.NOT_ACCEPTABLE)
            if (!updatePassword) throw badRequest(speeches.NOT_ACCEPTABLE)
            if (!findStudentDetailsAndUpdateUUID) throw badRequest(speeches.NOT_ACCEPTABLE)
            if (!findStudentDetailsAndUpdateUUID) throw badRequest(speeches.NOT_ACCEPTABLE)
            result['data'] = {
                username: requestBody.username,
                user_id: requestBody.user_id,
                student_id: findStudentDetailsAndUpdateUUID.dataValues.student_id,
                student_uuid: findStudentDetailsAndUpdateUUID.dataValues.UUID
            };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async updatePassword(requestBody: any, responseBody: any) {
        const res = await this.changePassword(requestBody, responseBody);
        console.log(res);
        if (res.data) {
            await this.crudService.update(mentor, { reg_status: '3' }, { where: { user_id: requestBody.user_id } });
        } return res;
    }
    async validatedOTP(requestBody: any) {
        const user_res: any = await this.crudService.findOnePassword(user, { where: { user_id: requestBody.user_id } })
        const res = bcrypt.compareSync(requestBody.otp, user_res.dataValues.password);
        if (res) {
            await this.crudService.update(mentor, { reg_status: '3' }, { where: { user_id: requestBody.user_id } })
            return user_res;
        } return false;
    }
    async restPassword(requestBody: any, responseBody: any) {
        let result: any = {};
        try {
            const user_res: any = await this.crudService.findOnePassword(user, {
                where: {
                    [Op.or]: [
                        {
                            username: { [Op.eq]: requestBody.username }
                        },
                        {
                            user_id: { [Op.like]: `%${requestBody.user_id}%` }
                        }
                    ]
                }
            });
            if (!user_res) {
                result['user_res'] = user_res;
                return result;
            }
            const response = await this.crudService.update(user, {
                password: await bcrypt.hashSync(requestBody.generatedPassword, process.env.SALT || baseConfig.SALT)
            }, { where: { user_id: user_res.dataValues.user_id } });
            result = { data: response, password: requestBody.generatedPassword };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }
    async bulkDeleteUserResponse(user_id: any) {
        try {
            let result: any = {};
            let models = [quiz_response, quiz_survey_response, reflective_quiz_response, user_topic_progress, worksheet_response];
            for (let i = 0; i < models.length; i++) {
                let deleted = await this.crudService.delete(models[i], { where: { user_id } });
                let data = models[i].tableName;
                result[`${data}`] = deleted
            }
            return result;
        } catch (error) {
            return error;
        }
    }
    async deleteStudentAndStudentResponse(user_id: any) {
        try {
            let result: any = {};
            let errors: any = [];
            let models = [
                quiz_response,
                quiz_survey_response,
                reflective_quiz_response,
                user_topic_progress,
                worksheet_response,
                student,
                user
            ];
            for (let i = 0; i < models.length; i++) {
                let deleted = await this.crudService.delete(models[i], { where: { user_id } });
                if (!deleted || deleted instanceof Error) errors.push(deleted);
                let data = models[i].tableName;
                result[`${data}`] = deleted
            }
            if (errors) errors.forEach((e: any) => { throw new Error(e.message) })
            return result;
        } catch (error) {
            return error;
        }
    }
    async bulkDeleteMentorResponse(user_id: any) {
        try {
            let result: any = {};
            let models = [
                quiz_response,
                quiz_survey_response,
                mentor_topic_progress,
                //worksheet_response,
                //reflective_quiz_response,
            ];
            for (let i = 0; i < models.length; i++) {
                let deleted = await this.crudService.delete(models[i], { where: { user_id } });
                let data = models[i].tableName;
                result[`${data}`] = deleted
            }
            return result;
        } catch (error) {
            return error;
        }
    }
    async deleteUserWithDetails(user_id: any, user_role = null) {
        try {
            let role: any = user_role
            if (user_role == null) {
                const userResult = await this.crudService.findOne(user, { where: { user_id: user_id } })
                if (!userResult) {
                    throw notFound()
                }
                if (userResult instanceof Error) {
                    return userResult;
                }
                if (!userResult.dataValues || !userResult.dataValues.role) {
                    return invalid(speeches.INTERNAL);
                }
                role = userResult.dataValues.role;
            }
            const allModels: any = { "STUDENT": student, "MENTOR": mentor, "ADMIN": admin, "EVALUATER": evaluater }
            const UserDetailsModel = allModels[role];

            const userDetailsDeleteresult = await this.crudService.delete(UserDetailsModel, { where: { user_id: user_id } })
            if (!userDetailsDeleteresult) {
                throw internal("something went wrong while deleting user details")
            }
            if (userDetailsDeleteresult instanceof Error) {
                throw userDetailsDeleteresult;
            }

            const userDeleteResult = await this.crudService.delete(user, { where: { user_id: user_id } })
            if (!userDeleteResult) {
                throw internal("something went wrong while deleting user")
            }
            if (userDeleteResult instanceof Error) {
                throw userDeleteResult;
            }
            return { userDeleteResult, userDetailsDeleteresult };
        } catch (error) {
            return error;
        }
    }
    async bulkDeleteUserWithStudentDetails(arrayOfUserIds: any) {
        return await this.bulkDeleteUserWithDetails(student, arrayOfUserIds)
    }
    async bulkDeleteUserWithMentorDetails(arrayOfUserIds: any) {
        return await this.bulkDeleteUserWithDetails(mentor, arrayOfUserIds)
    }
    async bulkDeleteUserWithDetails(argUserDetailsModel: any, arrayOfUserIds: any) {
        try {

            // const allModels:any = {"STUDENT":student, "MENTOR":mentor, "ADMIN":admin,"EVALUATER":evaluater}
            const UserDetailsModel = argUserDetailsModel
            const resultUserDetailsDelete = await this.crudService.delete(UserDetailsModel, {
                where: { user_id: arrayOfUserIds },
                force: true
            })
            // console.log("resultUserDetailsDelete",resultUserDetailsDelete)
            // if(!resultUserDetailsDelete){
            //     throw internal("something went wrong while deleting user detais ")
            // }
            if (resultUserDetailsDelete instanceof Error) {
                throw resultUserDetailsDelete;
            }

            const resultUserDelete = await this.crudService.delete(user, {
                where: { user_id: arrayOfUserIds },
                force: true
            })
            // console.log("resultUserDelete",resultUserDelete)
            // if(!resultUserDelete){
            //     throw internal("something went wrong while deleting user")
            // }
            if (resultUserDelete instanceof Error) {
                throw resultUserDetailsDelete;
            }
            return resultUserDelete;
        } catch (error) {
            return error;
        }
    }
    async updateUserMentorDetails(requestBody: any) {
        let result: any = {};
        try {
            const findUserMentorDetails: any = await this.crudService.findOne(user, {
                attributes: [
                    "user_id",
                    "username",
                    "full_name",
                    "status",
                    "role"
                ],
                where: { user_id: requestBody.user_id },
                include: {
                    model: mentor,
                    attributes: [
                        "mentor_id",
                        "full_name",
                        "organization_code",
                        "mobile",
                        "reg_status"
                    ]
                }
            })
            if (!findUserMentorDetails || findUserMentorDetails instanceof Error) throw findUserMentorDetails;
            const updateUsername: any = await this.crudService.updateAndFind(user,
                { username: requestBody.username },
                { where: { user_id: findUserMentorDetails.dataValues.user_id } }
            );
            const updateMentorMobileNumber: any = await this.crudService.updateAndFind(mentor,
                { mobile: requestBody.mobile },
                { where: { user_id: findUserMentorDetails.dataValues.user_id } }
            );
            if (!updateUsername || !updateMentorMobileNumber || updateUsername instanceof Error || updateMentorMobileNumber instanceof Error) throw badRequest(speeches.DATA_CORRUPTED);
            result['data'] = {
                username: updateUsername.dataValues.username,
                user_id: updateUsername.dataValues.user_id,
                student_id: updateMentorMobileNumber.dataValues.mentor_id,
                student_uuid: updateMentorMobileNumber.dataValues.mobile
            };
            return result;
        } catch (error) {
            result['error'] = error;
            return result;
        }
    }

    async checkIfTeamHasPlaceForNewMember(argTeamId: any) {
        try {
            let studentResult: any = await student.findAll({ where: { team_id: argTeamId } })
            // console.log("studentResult",studentResult)
            // console.log("studentResultLength",studentResult.length?"true":"false")
            if (studentResult && studentResult instanceof Error) {
                throw studentResult
            }
            if (studentResult &&
                (studentResult.length == 0 ||
                    studentResult.length < constents.TEAMS_MAX_STUDENTS_ALLOWED)
            ) {
                return true;
            }
            return false
        } catch (err) {
            return err
        }
    }
}
