import { Model } from "sequelize";
import { constents } from "../configs/constents.config";
import { speeches } from "../configs/speeches.config";
import TranslationsProvider from "../utils/translations/translationProvider";

export default class TranslationService {

    
    private currentLocale:any = constents.translations_flags.default_locale

    constructor(argCurrentLocale:string=constents.translations_flags.default_locale,initProviderAsWell=false){
        this.setCurrentLocale(argCurrentLocale)
        if(initProviderAsWell){
            TranslationsProvider.init()
        }
    }

    getSupportedLocales(){
        return TranslationsProvider.getSupportedLocales();
    }

    getDefaultLocale(){
        return TranslationsProvider.getDefaultLocale
    }

    getCurrentLocale(){
        return this.currentLocale
    }

    setCurrentLocale(argLocale:string){
        this.currentLocale = argLocale;
    }
    
    translateEntireObj(argObj:any){
        if(!argObj){
            return argObj
        }
        else if(typeof argObj == 'object'||Array.isArray(argObj)){
            
            //make sure sequelize model is objectified first before proessing further
            if(argObj instanceof Model){
                // sequelize doesnt have types for dataValues hence we need to bypaas dataValues type check
                // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
                // @ts-ignore
                argObj = argObj.dataValues;
            }

            for(var i = 0;i<Object.keys(argObj).length;i++){
                const key = Object.keys(argObj)[i];
                let value = argObj[key]///remember value can be 3 things, either obj or arr or others
                if(typeof value == 'object'||Array.isArray(value)){
                    argObj[key] = this.translateEntireObj(value);
                }
                else{
                    argObj[key] = this.translateTo(this.currentLocale,value)
                }
            }
        }else{
            argObj = this.translateTo(this.currentLocale,""+argObj)
        }
        
        return argObj
    }

    translate(argKey:string){
        return this.translateTo(this.currentLocale,argKey)
    }

    translateTo(argToLocale:string,argKey:string){
        return TranslationsProvider.getTranslationTo(argToLocale,argKey);
    }

    getSpeeches(){
        return TranslationsProvider.getSpeechesFor(this.currentLocale);
    }

    async refreshDataFromDb(){
       await  TranslationsProvider.init()
    }

    getTranslationKey(selected_option:any){
        try{
            const selected_optionArr = selected_option.split("{{}}"); ///multiple answers submitted can be represented as singlestrign separated by {{}} 
            // console.log(selected_optionArr)
            let resultArr = selected_optionArr.map((selectedOptionOne:any) => {
                return  TranslationsProvider.getTranslationKeyForValue(this.getCurrentLocale(),selectedOptionOne)
            });
            const result = resultArr.join("{{}}")
            // console.log("result",result)
            return result;
        }catch(err){
            console.log(err)
            return selected_option
        }
    }

    async translationRefresh(translateTable:any)
    {
        return TranslationsProvider.translateRefresh(translateTable)
    }
}