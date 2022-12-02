import { badRequest, internal, notFound, unauthorized } from "boom";
import { nextTick } from "process";
import { Op } from "sequelize";
import db from "../utils/dbconnection.util";
import { constents } from "../configs/constents.config";
import { speeches } from "../configs/speeches.config";
import { course_topic } from "../models/course_topic.model";
import { reflective_quiz_question } from "../models/reflective_quiz_question.model";
import { reflective_quiz_response } from "../models/reflective_quiz_response.model";
import { student } from "../models/student.model";
import BaseService from "./base.service";
import CRUDService from "./crud.service";
import DashboardService from "./dashboard.service";

export default class StudentService extends BaseService{
    
    async getTeamMembersForUserId(student_user_id:any){
        try{
            return await this.getTeamMembersForUserIdWithProgressAsOptional(student_user_id,false);
        }catch(err){
            return err;
        }
    }

    async getTeamMembersForUserIdWithProgressAsOptional(student_user_id:any,
        showProgressAsWell=false,addWhereClauseStatusPart=false,whereClauseStatusPartLiteral="1=1",showCurrUserAsWell=true){
        try{
            if(!student_user_id){
                throw badRequest(speeches.USER_NOT_FOUND)
            }
            const serviceDashboard = new DashboardService()
            let attrsToIncludeForProgress:any = []
            if(showProgressAsWell){
                attrsToIncludeForProgress=[
                    [
                        //todo:TODO:optimization:this can further be optimised interms of right now total over topics count remains same for all students ..but we are still querying this for all students 
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcsCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_topics_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "topics_completed_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForPreSurveyStatus(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "pre_survey_status"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForPostSurveyStatus(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "post_survey_status"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralIdeaSubmission(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "idea_submission"
                    ],
                    // [
                    //     { "certificate_status": 0 } // hardcoded for now, functionality yet to finalized
                    // ]
                ]
            }
            let whereClauseShowCurrUserPart = {}
            if(!showCurrUserAsWell){
                whereClauseShowCurrUserPart = { 
                    user_id:{
                        [Op.notIn]: [student_user_id],
                    }
                }
            }
            const studentResult = await student.findAll({
                attributes:{
                    include:attrsToIncludeForProgress
                },
                where:{
                    [Op.and]:[
                        {   team_id:{
                                [Op.in]: [
                                    db.literal(`(
                                        SELECT CASE WHEN EXISTS 
                                            (select team_id from students where user_id=${student_user_id}) 
                                        THEN  
                                            (select team_id from students where user_id=${student_user_id}) 
                                        ELSE 
                                            -1
                                        END
                                    )`)
                                ],
                            }
                        },
                        whereClauseShowCurrUserPart
                    ]
                    
                },
            })

            if(!studentResult){
                return studentResult
            }
            if(studentResult instanceof Error){
                throw studentResult;
            }
            return studentResult
        }catch(err){
            return err;
        }
    }

    async getTeamIdForUserId(student_user_id:any){
        try{
            if(!student_user_id){
                throw badRequest(speeches.USER_NOT_FOUND)
            }
            const studentResult = await student.findOne({
                where:{
                    user_id:student_user_id
                },
                attributes:[
                    "team_id"
                ],
                raw:true
            })
            if(!studentResult){
                throw notFound(speeches.USER_NOT_FOUND)
            }
            if(studentResult instanceof Error){
                throw studentResult;
            }
            return studentResult.team_id
        }catch(err){
            return err;
        }
    }
    async getStudentBadges(student_user_id:any){
        try{
            
            if(!student_user_id){
                throw badRequest(speeches.USER_NOT_FOUND)
            }
            const studentResult = await student.findOne({
                where:{
                    user_id:student_user_id
                },
                attributes:[
                    'badges',
                ]
            })
            if(!studentResult){
                throw badRequest(speeches.USER_NOT_FOUND) 
            }
            if(studentResult instanceof Error){
                throw studentResult
            }
            
            //@ts-ignore
            const studentBadgesString = studentResult.dataValues.badges;
            
            const studentBadgesObj:any = JSON.parse(studentBadgesString);
            return studentBadgesObj
        }catch(err){
            return err
        }
    }

}


