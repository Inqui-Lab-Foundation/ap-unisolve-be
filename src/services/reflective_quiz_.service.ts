import { badRequest, internal, unauthorized } from "boom";
import { Op } from "sequelize";
import { constents } from "../configs/constents.config";
import { speeches } from "../configs/speeches.config";
import { course_topic } from "../models/course_topic.model";
import { reflective_quiz_question } from "../models/reflective_quiz_question.model";
import { reflective_quiz_response } from "../models/reflective_quiz_response.model";
import BaseService from "./base.service";
import CRUDService from "./crud.service";

export default class ReflectiveQuizService extends BaseService {

    public async fetchNextQuestion(user_id: number, video_id: any, paramStatus: any) {
        try {
            if (!video_id) {
                throw badRequest(speeches.QUIZ_ID_REQUIRED);
            }
            if (!user_id) {
                throw unauthorized(speeches.UNAUTHORIZED_ACCESS);
            }
            //check if the given quiz is a valid topic
            // const curr_topic =  await this.crudService.findOne(course_topic,{where:{"topic_type_id":video_id,"topic_type":"VIDEO"}})
            // if(!curr_topic || curr_topic instanceof Error){
            //     throw badRequest("INVALID TOPIC");
            // }

            const quizRes = await this.crudService.findOne(reflective_quiz_response, { where: { video_id: video_id, user_id: user_id } });
            if (quizRes instanceof Error) {
                throw internal(quizRes.message)
            }
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
            let level = "HARD"
            let question_no = 1
            let nextQuestion: any = null;
            // console.log(quizRes)
            if (quizRes) {
                //TOOO :: implement checking response and based on that change the 
                let user_response: any = {}
                user_response = JSON.parse(quizRes.dataValues.response);
                // console.log(user_response);
                let questionNosAsweredArray = Object.keys(user_response);
                questionNosAsweredArray = questionNosAsweredArray.sort((a, b) => (Number(a) > Number(b) ? -1 : 1));
                const noOfQuestionsAnswered = Object.keys(user_response).length
                // console.log(noOfQuestionsAnswered)
                const lastQuestionAnsewered = user_response[questionNosAsweredArray[0]]//we have assumed that this length will always have atleast 1 item ; this could potentially be a source of bug, but is not since this should always be true based on above checks ..
                // if(lastQuestionAnsewered.selected_option == lastQuestionAnsewered.correct_answer){
                question_no = lastQuestionAnsewered.question_no + 1;
                level = "HARD";
                // }else{
                //     question_no = lastQuestionAnsewered.question_no;
                //     if(lastQuestionAnsewered.level == "HARD"){
                //         level = "MEDIUM"
                //     }else if(lastQuestionAnsewered.level == "MEDIUM"){
                //         level = "EASY"
                //     }else if(lastQuestionAnsewered.level == "EASY"){
                //         question_no = lastQuestionAnsewered.question_no+1;
                //         level = "HARD"
                //     }
                // }
            }
            const nextQuestionsToChooseFrom = await this.crudService.findOne(reflective_quiz_question, {
                where: {
                    [Op.and]: [
                        { video_id: video_id },
                        { level: level },
                        { question_no: question_no },
                        whereClauseStatusPart,
                    ]

                }
            })
            if (nextQuestionsToChooseFrom instanceof Error) {
                throw internal(nextQuestionsToChooseFrom.message)
            }
            return nextQuestionsToChooseFrom
        } catch (error) {
            return error;
        }
    }
}


