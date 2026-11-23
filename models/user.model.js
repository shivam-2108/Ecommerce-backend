import mongoose from "mongoose";
const userSchema=new mongoose.Schema(
    {
        name:{
            type:String,
            required:[true,"Name is required"],
            trim:true,
        },
        password:{
            type:String,
            required:[true,"Password is required"],
            minlength:[8,"Password must be atleast 8 character"],
            select:false,
        },
        email:{
            type:String,
            required:[true,"Email is required"],
            unique:true,
            lowercase:true,
            trim:true,
        },
        role:{
            type:String,
            enum:["admin","user"],
            default:"user",
        },
    },
    {timestamps:true}
);

const User =mongoose.model("User",userSchema);
export default User;