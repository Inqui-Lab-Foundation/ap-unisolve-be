import { challenge_response } from "../models/challenge_response.model";
import { dashboard_map_stat } from "../models/dashboard_map_stat.model";
import { mentor } from "../models/mentor.model";
import { organization } from "../models/organization.model";
import { student } from "../models/student.model";
import { team } from "../models/team.model";
import BaseService from "./base.service";

export default class DashboardService extends BaseService {

    async resetMapStats() {
        try{
            let uniqueDistricts: any;
            let bulkCreateArray: any = [];
            uniqueDistricts = await this.crudService.findAll(organization, { group: ["district"] });
            if(!uniqueDistricts || uniqueDistricts.length<=0){
                console.log("uniqueDistricts",uniqueDistricts)
                return 
            }
            if(uniqueDistricts instanceof Error){
                console.log("uniqueDistricts",uniqueDistricts)
                return 
            }
            for (const district of uniqueDistricts) {
                try{
                    if (district.district === null) {
                        continue
                    }
                    const stats: any = await this.getMapStatsForDistrict(district.dataValues.district)

                    bulkCreateArray.push({
                        overall_schools: stats.schoolIdsInDistrict.length,
                        reg_schools: stats.registeredSchoolIdsInDistrict.length,
                        teams: stats.teamIdInDistrict.length,
                        ideas: stats.challengeInDistrict.length,
                        district_name: district.district,
                        students: stats.studentsInDistric.length
                    })
                }catch(err){
                    console.log(err)
                }
            }

            const statsForAllDistrics: any = await this.getMapStatsForDistrict(null)

            bulkCreateArray.push({
                overall_schools: statsForAllDistrics.schoolIdsInDistrict.length,
                reg_schools: statsForAllDistrics.registeredSchoolIdsInDistrict.length,
                teams: statsForAllDistrics.teamIdInDistrict.length,
                ideas: statsForAllDistrics.challengeInDistrict.length,
                district_name: "all",
                students: statsForAllDistrics.studentsInDistric.length,
            })

            await this.crudService.delete(dashboard_map_stat, { where: {}, truncate: true });
            const result = await this.crudService.bulkCreate(dashboard_map_stat, bulkCreateArray);
            // console.log(result)
            return result;
        }catch(err){
            return err
        }
    }

    async getMapStatsForDistrict(argdistric: any = null) {
        try{
            let whereClause = {}
            let schoolIdsInDistrict:any =[];
            let mentorIdInDistrict:any =[];
            let registeredSchoolIdsInDistrict:any =[];
            let teamIdInDistrict:any =[];
            let challengeInDistrict:any =[];
            let studentsInDistric:any =[];

            if (argdistric) {
                whereClause = {
                    district: argdistric,
                    status: "ACTIVE"
                }
            }
            const overAllSchool = await this.crudService.findAll(organization, {
                where: whereClause
            });
            // if(argdistric=="b"){
            //     console.log(argdistric)
            //     console.log(overAllSchool)
            // }
            if(!overAllSchool || (!overAllSchool.length) || overAllSchool.length==0){
                return {
                    schoolIdsInDistrict: schoolIdsInDistrict,
                    registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                    teamIdInDistrict: teamIdInDistrict,
                    challengeInDistrict: challengeInDistrict,
                    studentsInDistric: studentsInDistric
                }
            }
            schoolIdsInDistrict = overAllSchool.map((Element: any) => Element.dataValues.organization_code);

            const mentorReg = await this.crudService.findAll(mentor, {
                where: {
                    organization_code: schoolIdsInDistrict
                }
            });
            if(!mentorReg || (!mentorReg.length) || mentorReg.length==0){
                return {
                    schoolIdsInDistrict: schoolIdsInDistrict,
                    registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                    teamIdInDistrict: teamIdInDistrict,
                    challengeInDistrict: challengeInDistrict,
                    studentsInDistric: studentsInDistric
                }
            }
            mentorIdInDistrict = mentorReg.map((Element: any) => Element.dataValues.mentor_id);//changed this to  user_id from mentor_id, because teams has mentor linked with team via user_id as value in the mentor_id collumn of the teams table
            
            const schoolRegistered = await this.crudService.findAll(mentor, {
                where: {
                    mentor_id: mentorIdInDistrict,
                },
                group: ['organization_code']
            });
            if(!schoolRegistered || (!schoolRegistered.length) || schoolRegistered.length==0){
                // return {
                //     schoolIdsInDistrict: schoolIdsInDistrict,
                //     registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                //     teamIdInDistrict: teamIdInDistrict,
                //     challengeInDistrict: challengeInDistrict,
                //     studentsInDistric: studentsInDistric
                // }
                registeredSchoolIdsInDistrict=[]
            }else{
                registeredSchoolIdsInDistrict = schoolRegistered.map((Element: any) => Element.dataValues.organization_code);
            }
            

            const teamReg = await this.crudService.findAll(team, {
                where: { mentor_id: mentorIdInDistrict }
            });
            if(!teamReg || (!teamReg.length) || teamReg.length==0){
                return {
                    schoolIdsInDistrict: schoolIdsInDistrict,
                    registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                    teamIdInDistrict: teamIdInDistrict,
                    challengeInDistrict: challengeInDistrict,
                    studentsInDistric: studentsInDistric
                }
            }
            teamIdInDistrict = teamReg.map((Element: any) => Element.dataValues.team_id);
            
            const challengeReg = await this.crudService.findAll(challenge_response, {
                where: { team_id: teamIdInDistrict }
            });
            if(!challengeReg || (!challengeReg.length) || challengeReg.length==0){
                // return {
                //     schoolIdsInDistrict: schoolIdsInDistrict,
                //     registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                //     teamIdInDistrict: teamIdInDistrict,
                //     challengeInDistrict: challengeInDistrict,
                //     studentsInDistric: studentsInDistric
                // }
                challengeInDistrict=[]
            }else{
                challengeInDistrict = challengeReg.map((Element: any) => Element.dataValues.challenge_response_id);
            }
            
            
            const studentsResult = await student.findAll({
                attributes: [
                    "user_id",
                    "student_id"
                ],
                where: {
                    team_id: teamIdInDistrict
                }
            })
            if(!studentsResult || (!studentsResult.length) || studentsResult.length==0){
                // return {
                //     schoolIdsInDistrict: schoolIdsInDistrict,
                //     registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                //     teamIdInDistrict: teamIdInDistrict,
                //     challengeInDistrict: challengeInDistrict,
                //     studentsInDistric: studentsInDistric
                // }
                studentsInDistric=[]
            }else{
                studentsInDistric = studentsResult.map((Element: any) => Element.dataValues.student_id);
            }
            studentsInDistric = studentsResult.map((Element: any) => Element.dataValues.student_id);

            return {
                schoolIdsInDistrict: schoolIdsInDistrict,
                registeredSchoolIdsInDistrict: registeredSchoolIdsInDistrict,
                teamIdInDistrict: teamIdInDistrict,
                challengeInDistrict: challengeInDistrict,
                studentsInDistric: studentsInDistric
            }
        }catch(err){
            return err
        }
    }



    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////  Dashboard student helpers....!!                 
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    getDbLieralForAllToipcsCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
             select count(t.course_topic_id) 
             from course_topics as t
             where 
             ${addWhereClauseStatusPart ? "t." + whereClauseStatusPartLiteral : whereClauseStatusPartLiteral}
             `
    }
    getDbLieralForAllToipcVideosCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return this.getDbLieralForAllToipcsCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral) +
            `and t.topic_type = "VIDEO"`
    }
    getDbLieralForAllToipcWorksheetCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return this.getDbLieralForAllToipcsCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral) +
            `and t.topic_type = "WORKSHEET"`
    }
    getDbLieralForAllToipcQuizCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return this.getDbLieralForAllToipcsCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral) +
            `and t.topic_type = "QUIZ"`
    }
    getDbLieralCommPartToipcsCompletedCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any, whereOperation: any) {
        return `
        select utp.user_id
                from user_topic_progress as utp
                join course_topics as t on t.course_topic_id=utp.course_topic_id
                where 
                1=1
                and utp.user_id=\`student\`.\`user_id\`
                and utp.status = "COMPLETED"
                ${whereOperation}
                group by utp.user_id,utp.course_topic_id
        `
    }

    getDbLieralForAllToipcsCompletedCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from (
            ${this.getDbLieralCommPartToipcsCompletedCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral, '')}
            ) as count
        `
    }
    getDbLieralForPreSurveyStatus(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from quiz_survey_responses as preSurvey where preSurvey.user_id = \`student\`.\`user_id\` and preSurvey.quiz_survey_id = 2 is true
        `
    }
    getDbLieralForPostSurveyStatus(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from quiz_survey_responses as preSurvey where preSurvey.user_id = \`student\`.\`user_id\` and preSurvey.quiz_survey_id = 4 is true
        `
    }
    getDbLieralIdeaSubmission(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
        select count(*) from challenge_responses as idea where idea.team_id = \`student\`.\`team_id\` 
        `
    }
    getDbLieralForVideoToipcsCompletedCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from (
            ${this.getDbLieralCommPartToipcsCompletedCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral, 'and t.topic_type = "VIDEO"')}
            ) as count
        `
        //  return this.getDbLieralForAllToipcsCompletedCount(addWhereClauseStatusPart,whereClauseStatusPartLiteral)+
        //  `and t.topic_type = "VIDEO"`
    }
    getDbLieralForWorksheetToipcsCompletedCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from (
            ${this.getDbLieralCommPartToipcsCompletedCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral, ' and t.topic_type = "WORKSHEET"')}
            ) as count
        `
        //  return this.getDbLieralForAllToipcsCompletedCount(addWhereClauseStatusPart,whereClauseStatusPartLiteral)+
        //  `and t.topic_type = "WORKSHEET"`
    }
    getDbLieralForQuizToipcsCompletedCount(addWhereClauseStatusPart: any, whereClauseStatusPartLiteral: any) {
        return `
            select count(*) from (
            ${this.getDbLieralCommPartToipcsCompletedCount(addWhereClauseStatusPart, whereClauseStatusPartLiteral, 'and t.topic_type = "QUIZ"')}
            ) as count
        `
        //  return this.getDbLieralForAllToipcsCompletedCount(addWhereClauseStatusPart,whereClauseStatusPartLiteral)+
        //  `and t.topic_type = "QUIZ"`
    }

}