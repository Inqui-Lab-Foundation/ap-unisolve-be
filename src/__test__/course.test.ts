import supertest from "supertest";

import createServer from "../utils/server";
import { courses } from "../models/course.model";

const app = createServer(); 

// test cases for Course API's
describe("Courser test cases", () => {
    describe("Courser: create the course", () => {
        beforeAll(() => jest.setTimeout(6000))
        const Payload = {
            "module": "1",
            "courser_id": "4623236",
            "statue": "Completed"
        };
        test("Should return 200 & create account", async () => {
            const mockCreateIntense = jest.fn((): any => Payload)
            jest
                .spyOn(courses, "create")
                .mockImplementation(() => mockCreateIntense());
            const { statusCode, body } = await supertest(app)
                .post("/api/v1/course/create")
                .send(Payload)
            expect(statusCode).toBe(200)
        });
    });
    describe("Courser: get the list of the courses", () => {
        test("Should return 200", async () => {
            const { statusCode, body } = await supertest(app)
                .get("/api/v1/course/list")
            expect(statusCode).toBe(200)
            expect(body).toHaveProperty("product")
        });
    });
    describe("Courser: get the single course", () => {
        test("Should return 200", async () => {
            const { statusCode, body } = await supertest(app)
                .get("/api/course/courseList")
            expect(statusCode).toBe(200)
            expect(body).toHaveProperty("product")
        });
    });
    describe("Courser: get the single course", () => {
        test("Should return 200", async () => {
            const { statusCode, body } = await supertest(app)
                .get("/api/course/1")
            expect(statusCode).toBe(200)
            expect(body).toHaveProperty("product")
        });
    });
    describe("Courser: update the single course", () => {
        test("Should return 200", async () => {
            const { statusCode, body } = await supertest(app)
                .put("/api/course/1")
            expect(statusCode).toBe(200)
        });
    });
    describe("Courser: update the single course", () => {
        test("Should return 200", async () => {
            const { statusCode, body } = await supertest(app)
                .delete("/api/course/1")
            expect(statusCode).toBe(200)
        });
    });
});