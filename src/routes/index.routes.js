import usermodel from "../models/auth.model.js"
import bcrypt from "bcrypt"

export default async function indexRoutes(fastify) {
 fastify.get("/",async(req,res)=>{
  const user = {
   username:"Super Admin",
   fullname:"Super Admin",
   password:"superadmin@123",
   role:"SUPER ADMIN"
  }
  user.password = await bcrypt.hash(user.password,10)
  const userExist = await usermodel.findOne({username:user.username})
  if(userExist){
    res.status(200).send({status:true,message:"server running successfully (user exist)"})
  }
  await usermodel.create(user).then(data=>{
   return res.status(200).send({status:true,message:"server running successfully (user created)"});
  })
   res.status(200).send({status:true,message:"server running successfully"})
 })
}