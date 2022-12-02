import { Request, Response, NextFunction } from 'express';

import { speeches } from '../configs/speeches.config';
import dispatcher from '../utils/dispatch.util';
import authService from '../services/auth.service';
import BaseController from './base.controller';
import ValidationsHolder from '../validations/validationHolder';
import db from "../utils/dbconnection.util";
import { Op } from 'sequelize';
import DashboardMapStatsJob from '../jobs/dashboardMapStats.jobs';
import { dashboard_map_stat } from '../models/dashboard_map_stat.model';
import DashboardService from '../services/dashboard.service';
import { mentor } from '../models/mentor.model';
import { organization } from '../models/organization.model';
import { constents } from '../configs/constents.config';
import path from 'path';
import { readFileSync } from 'fs';
import { badData, internal, notFound } from 'boom';
import { student } from '../models/student.model';
import { team } from '../models/team.model';
import { challenge_response } from '../models/challenge_response.model';
import StudentService from '../services/students.service';


export default class DashboardController extends BaseController {
    model = ""; ///this u will override in every function in this controller ...!!!

    protected initializePath(): void {
        this.path = '/dashboard';
    }
    protected initializeValidations(): void {
        this.validations = new ValidationsHolder(null, null);
    }
    protected initializeRoutes(): void {
        //example route to add
        //this.router.get(`${this.path}/`, this.getData);

        ///map stats
        this.router.get(`${this.path}/refreshMapStatsLive`, this.getMapStatsLive.bind(this))
        this.router.get(`${this.path}/mapStats`, this.getMapStats.bind(this))
        this.router.get(`${this.path}/refreshMapStats`, this.refreshMapStats.bind(this))


        //mentor stats...
        this.router.get(`${this.path}/mentorStats/:mentor_user_id`, this.getMentorStats.bind(this))
        // this.router.get(`${this.path}/mentorStats/:mentor_id/progessOverall`, this.getMentorStatsProgressOverall.bind(this))

        //student Stats...
        this.router.get(`${this.path}/studentStats/:student_user_id`, this.getStudentStats.bind(this))
        this.router.get(`${this.path}/studentStats/:student_user_id/challenges`, this.getStudentChallengeDetails.bind(this))
        this.router.get(`${this.path}/studentStats/:student_user_id/teamProgress`, this.getTeamProgress.bind(this))

        //team stats..
        this.router.get(`${this.path}/teamStats/:team_id`, this.getTeamStats.bind(this));

        super.initializeRoutes();
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////
    ///////// MENTOR STATS
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    private async getMentorStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { mentor_user_id } = req.params;
            const paramStatus: any = req.query.status;
            let whereClauseStatusPart: any = {};
            let whereClauseStatusPartLiteral = "1=1";
            let addWhereClauseStatusPart = false
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
                whereClauseStatusPartLiteral = `status = "${paramStatus}"`
                addWhereClauseStatusPart = true;
            }

            const mentor_stats = await mentor.findOne({
                where: {
                    user_id: mentor_user_id,
                },
                attributes: [
                    [
                        db.literal(`(
                        select count(s.student_id) 
                        from students as s
                        where 
                        ${addWhereClauseStatusPart ? "s." + whereClauseStatusPartLiteral : whereClauseStatusPartLiteral}
                        and s.team_id in (
                            select team_id 
                            from teams as t
                            where 
                            ${addWhereClauseStatusPart ? "t." + whereClauseStatusPartLiteral : whereClauseStatusPartLiteral}
                            and t.mentor_id=\`mentor\`.\`user_id\`)
                            )`),
                        "students_count"
                    ],
                    [
                        db.literal(`(
                        select count(c.team_id) 
                        from challenge_responses as c 
                        where c.team_id in (
                            select team_id 
                            from teams as t
                            where 
                            ${addWhereClauseStatusPart ? "t." + whereClauseStatusPartLiteral : whereClauseStatusPartLiteral}
                            and t.mentor_id=\`mentor\`.\`user_id\`) 
                        and c.status not in ('DRAFT')
                        )`),
                        "ideas_count"
                    ],
                    [
                        db.literal(`(
                        select count(t.team_id) 
                        from teams as t
                        where 
                        ${addWhereClauseStatusPart ? "t." + whereClauseStatusPartLiteral : whereClauseStatusPartLiteral}
                        and t.mentor_id=\`mentor\`.\`mentor_id\`
                        and t.status='ACTIVE'
                        )`),
                        "teams_count"
                    ]
                ],
                include: {
                    model: organization,
                    attributes: [
                        'organization_name',
                        'district'
                    ]

                }
            })
            if (mentor_stats instanceof Error) {
                throw mentor_stats
            }
            if (mentor_stats) {
                res.status(200).json(dispatcher(res, mentor_stats, "success"))
            } else {
                res.status(500).json(dispatcher(res, "something went wrong", "error"))
            }
        } catch (err) {
            next(err)
        }
    }

    private async getMentorStatsProgressOverall(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const options = {
                root: path.join(process.cwd(), 'resources', 'configs'),
                headers: {
                    'x-timestamp': Date.now(),
                    'x-sent': true
                }
            };
            const filePath = path.join(process.cwd(), 'resources', 'configs', 'roadMap.json');
            if (filePath === 'Error') {
                return res.status(404).send(dispatcher(res, speeches.FILE_EMPTY, 'error', speeches.DATA_NOT_FOUND));
            }
            var file: any = readFileSync(path.join(process.cwd(), 'resources', 'configs', 'roadMap.json'), {
                encoding: 'utf8',
                flag: 'r'
            })

            if (file instanceof Error) {
                throw file;
            }

            // if(!file){
            //     file=JSON.parse(file)
            //     console.log("file",file)
            //     if(!file.teacher || typeof file.teacher !='object'){
            //         throw internal(speeches.ROADMAP_FILE_CORRUPTED)
            //     }
            // }
            console.log(file.teacher);
            const teacherStepsTotal = Object.keys(file.teacher);
            const totalNoOfSteps = teacherStepsTotal.length;
            let totalNoOfCompletedSteps = 0;
            for (var i = 0; i < totalNoOfSteps; i++) {
                const step = file.teacher[teacherStepsTotal[i]];
                if (!step.start_date || step.end_date) {
                    continue;
                }
                try {
                    const startDate = new Date(step.start_date).getTime();
                    const endDate = new Date(step.end_date).getTime();
                    const currDate = new Date().getTime();
                    if (currDate << endDate && currDate >> startDate) {
                        totalNoOfCompletedSteps++;
                    }

                } catch (err) {
                    continue;
                }

            }

            const result = {
                "total_steps": totalNoOfSteps,
                "completed_steps": totalNoOfCompletedSteps,
                "progress": ((totalNoOfCompletedSteps / totalNoOfSteps) * 100)
            }

            res.send(dispatcher(res, result, "success"))

        } catch (err) {
            next(err)
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////
    ///////// STUDENT STATS
    ///////// PS: this assumes that there is only course in the systems and hence alll topics inside topics table are taken for over counts
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    private async getStudentStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { student_user_id } = req.params;
            const paramStatus: any = req.query.status;
            let whereClauseStatusPart: any = {};
            let whereClauseStatusPartLiteral = "1=1";
            let addWhereClauseStatusPart = false
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
                whereClauseStatusPartLiteral = `status = "${paramStatus}"`
                addWhereClauseStatusPart = true;
            }

            const serviceDashboard = new DashboardService();
            const studentStatsResul: any = await student.findOne({
                where: {
                    user_id: student_user_id
                },
                raw: true,
                attributes: [
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcsCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_topics_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcVideosCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_videos_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcWorksheetCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_worksheets_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcQuizCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_quiz_count"
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
                            ${serviceDashboard.getDbLieralForVideoToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "videos_completed_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForWorksheetToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "worksheet_completed_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForQuizToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "quiz_completed_count"
                    ],
                    "badges"
                ]
            })
            if (!studentStatsResul) {
                throw notFound(speeches.USER_NOT_FOUND)
            }
            if (studentStatsResul instanceof Error) {
                throw studentStatsResul
            }
            // console.log(studentStatsResul)
            const badges = studentStatsResul.badges;
            let badgesCount = 0
            if (badges) {
                const badgesParsed = JSON.parse(badges);
                if (badgesParsed) {
                    badgesCount = Object.keys(badgesParsed).length
                }
                delete studentStatsResul.badges;
            }
            studentStatsResul["badges_earned_count"] = badgesCount;



            res.status(200).send(dispatcher(res, studentStatsResul, "success"))

        } catch (err) {
            next(err)
        }
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    ///////// TEAM STATS
    ///////// PS: this assumes that there is only course in the systems and hence alll topics inside topics table are taken for over counts
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    private async getTeamStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { team_id } = req.params;
            const paramStatus: any = req.query.status;
            let whereClauseStatusPart: any = {};
            let whereClauseStatusPartLiteral = "1=1";
            let addWhereClauseStatusPart = false
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
                whereClauseStatusPartLiteral = `status = "${paramStatus}"`
                addWhereClauseStatusPart = true;
            }

            const serviceDashboard = new DashboardService();
            const studentStatsResul: any = await student.findAll({
                where: { team_id },
                raw: true,
                attributes: [
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcsCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_topics_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcVideosCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_videos_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcWorksheetCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_worksheets_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForAllToipcQuizCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "all_quiz_count"
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
                            ${serviceDashboard.getDbLieralForVideoToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "videos_completed_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForWorksheetToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "worksheet_completed_count"
                    ],
                    [
                        db.literal(`(
                            ${serviceDashboard.getDbLieralForQuizToipcsCompletedCount(addWhereClauseStatusPart,
                            whereClauseStatusPartLiteral)}
                            )`),
                        "quiz_completed_count"
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
                    "certificate",
                    "badges",
                    "created_at",
                    "full_name",
                    "user_id"
                ]
            })
            if (!studentStatsResul) {
                throw notFound(speeches.USER_NOT_FOUND)
            }
            if (studentStatsResul instanceof Error) {
                throw studentStatsResul
            }
            console.log(studentStatsResul)
            const badges = studentStatsResul.badges;
            let badgesCount = 0
            if (badges) {
                const badgesParsed = JSON.parse(badges);
                if (badgesParsed) {
                    badgesCount = Object.keys(badgesParsed).length
                }
                delete studentStatsResul.badges;
            }
            studentStatsResul["badges_earned_count"] = badgesCount;



            res.status(200).send(dispatcher(res, studentStatsResul, "success"))

        } catch (err) {
            next(err)
        }
    }

    private async getStudentChallengeDetails(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {

            const { student_user_id } = req.params;
            const paramStatus: any = req.query.status;
            let whereClauseStatusPart: any = {};
            let whereClauseStatusPartLiteral = "1=1";
            let addWhereClauseStatusPart = false
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
                whereClauseStatusPartLiteral = `status = "${paramStatus}"`
                addWhereClauseStatusPart = true;
            }
            const studentService = new StudentService();
            const endDate = "20th November 2022 at 12pm"
            let challenge_submission_status = false
            let result: any = {
                end_date: "20th November 2022 at 12pm"
            }
            let teamMembers: any = await studentService.getTeamMembersForUserId(student_user_id)
            if (!teamMembers) {
                teamMembers = []
            }
            if (teamMembers instanceof Error) {
                throw teamMembers
            }
            result = {
                ...result,
                "challenge_submission_status": challenge_submission_status,
                "team_members": teamMembers
            }
            // console.log("teamMembers",teamMembers)
            if (teamMembers.length <= 0) {
                res.status(200).send(dispatcher(res, result, "success"))
                return;
            }

            const studentChallengeSubmission = await challenge_response.findAll({
                where: {
                    team_id: teamMembers[0].team_id
                }
            })

            if (!studentChallengeSubmission) {
                res.status(200).send(dispatcher(res, result, "success"))
                return;
            }
            if (studentChallengeSubmission instanceof Error) {
                throw studentChallengeSubmission
            }

            challenge_submission_status = true;
            result = {
                ...result,
                "challenge_submission_status": challenge_submission_status,
                "team_members": teamMembers
            }
            res.status(200).send(dispatcher(res, result, "success"))
            return;
        } catch (err) {
            next(err)
        }
    }
    private async getTeamProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const { student_user_id } = req.params;
            const paramStatus: any = req.query.status;
            let whereClauseStatusPart: any = {};
            let whereClauseStatusPartLiteral = "1=1";
            let addWhereClauseStatusPart = false
            if (paramStatus && (paramStatus in constents.common_status_flags.list)) {
                whereClauseStatusPart = { "status": paramStatus }
                whereClauseStatusPartLiteral = `status = "${paramStatus}"`
                addWhereClauseStatusPart = true;
            }
            const studentService = new StudentService();

            let teamMembers: any = await studentService.getTeamMembersForUserIdWithProgressAsOptional(
                student_user_id,
                true,
                addWhereClauseStatusPart,
                whereClauseStatusPartLiteral)

            if (!teamMembers) {
                throw badData(speeches.TEAM_NOT_FOUND)
            }
            if (teamMembers instanceof Error) {
                throw teamMembers
            }

            res.status(200).send(dispatcher(res, teamMembers, "success"))

        } catch (err) {
            next(err)
        }
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////
    ///////// MAPP STATS
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    private async refreshMapStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const service = new DashboardService()
            const result = await service.resetMapStats()
            res.status(200).json(dispatcher(res, result, "success"))
        } catch (err) {
            next(err);
        }
    }
    private async getMapStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            this.model = dashboard_map_stat.name
            return await this.getData(req, res, next)
        } catch (error) {
            next(error);
        }
    };

    private async getMapStatsLive(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const service = new DashboardService()
            await service.resetMapStats()
            this.model = dashboard_map_stat.name
            return await this.getData(req, res, next)
        } catch (error) {
            next(error);
        }
    };
};