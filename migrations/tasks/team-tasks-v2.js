import filter from 'lodash/filter';
import find from 'lodash/find';
import isArray from 'lodash/isArray';
import { model as Group } from '../../website/server/models/group';
import * as Tasks from '../../website/server/models/task';

async function updateTeamTasks (team) {
  const toSave = [];
  const teamTasks = await Tasks.Task.find({
    'group.id': team._id,
  }).exec();

  const teamBoardTasks = filter(teamTasks, task => !task.userId);
  const teamUserTasks = filter(teamTasks, task => task.userId);

  for (const boardTask of teamBoardTasks) {
    if (isArray(boardTask.group.assignedUsers)) {
      boardTask.group.approval = undefined;
      boardTask.group.assignedDate = undefined;
      boardTask.group.assigningUsername = undefined;
      boardTask.group.sharedCompletion = undefined;

      for (const assignedUser of boardTask.group.assignedUsers) {
        const userTask = find(teamUserTasks, task => task.userId === assignedUser
           && task.group.taskId === boardTask._id);
        if (!boardTask.group.assignedUsersDetail) boardTask.group.assignedUsersDetail = {};
        if (userTask) {
          boardTask.group.assignedUsersDetail[assignedUser] = {
            assignedDate: userTask.group.assignedDate,
            assigningUsername: userTask.group.assigningUsername,
            completed: userTask.completed || false,
            completedDate: userTask.dateCompleted,
          };
          toSave.push(Tasks.Task.findByIdAndDelete(userTask._id));
        } else {
          boardTask.group.assignedUsersDetail[assignedUser] = {
            assignedDate: new Date(),
            assigningUsername: null,
            completed: false,
            completedDate: null,
          };
        }
      }
      boardTask.markModified('group');
      toSave.push(boardTask.save());
    }
  }

  return Promise.all(toSave);
}

export default async function processTeams () {
  const activeTeams = await Group.find({
    'purchased.plan.customerId': { $exists: true },
    $or: [
      { 'purchased.plan.dateTerminated': { $exists: false } },
      { 'purchased.plan.dateTerminated': null },
      { 'purchased.plan.dateTerminated': { $gt: new Date() } },
    ],
  }).exec();

  const taskPromises = activeTeams.map(updateTeamTasks);
  return Promise.all(taskPromises);
}
