import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({

    student:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    course:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Course"
    },

    completedModules:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"Module"
        }
    ]

},
{
    timestamps:true
});

progressSchema.index({ student: 1, course: 1 });
progressSchema.index({ student: 1 });

const Progress = mongoose.model(
    "Progress",
    progressSchema
);

export default Progress;