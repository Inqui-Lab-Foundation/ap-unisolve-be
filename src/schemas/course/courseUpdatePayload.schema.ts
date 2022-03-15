/*Importing the dependencies*/
import { object, z, TypeOf, } from "zod";
import { Omit } from 'lodash';

export const courseUpdate = object({
    body: object({
        statue: z.enum(["Completed", "Incomplete"])
    })
});


export type CourseUpdateInput = Omit<TypeOf<typeof courseUpdate>, "body.passwordConfirmation">;


