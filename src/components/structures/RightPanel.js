/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 Vector Creations Ltd
Copyright 2017 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import PropTypes from 'prop-types';
import { _t } from 'matrix-react-sdk/lib/languageHandler';
import sdk from 'matrix-react-sdk';
import dis from 'matrix-react-sdk/lib/dispatcher';
import MatrixClientPeg from 'matrix-react-sdk/lib/MatrixClientPeg';
import Analytics from 'matrix-react-sdk/lib/Analytics';
import rate_limited_func from 'matrix-react-sdk/lib/ratelimitedfunc';
import AccessibleButton from 'matrix-react-sdk/lib/components/views/elements/AccessibleButton';
import { showGroupInviteDialog, showGroupAddRoomDialog } from 'matrix-react-sdk/lib/GroupAddressPicker';

class HeaderButton extends React.Component {
    constructor() {
        super();
        this.onClick = this.onClick.bind(this);
    }

    onClick(ev) {
        Analytics.trackEvent(...this.props.analytics);
        dis.dispatch({
            action: 'view_right_panel_phase',
            phase: this.props.clickPhase,
        });
    }

    render() {
        const TintableSvg = sdk.getComponent("elements.TintableSvg");
        const AccessibleButton = sdk.getComponent("elements.AccessibleButton");

        return <AccessibleButton className="mx_RightPanel_headerButton" onClick={this.onClick} >
            <div className="mx_RightPanel_headerButton_badge">
                { this.props.badge ? this.props.badge : <span>&nbsp;</span> }
            </div>
            <TintableSvg src={this.props.iconSrc} width="25" height="25"/>
            { this.props.isHighlighted ? <div className="mx_RightPanel_headerButton_highlight"></div> : <div/> }
        </AccessibleButton>;
    }
}

HeaderButton.propTypes = {
    // Whether this button is highlighted
    isHighlighted: PropTypes.bool.isRequired,
    // The phase to swap to when the button is clicked
    clickPhase: PropTypes.string.isRequired,
    // The source file of the icon to display
    iconSrc: PropTypes.string.isRequired,

    // The badge to display above the icon
    badge: PropTypes.node,
    // The parameters to track the click event
    analytics: PropTypes.arrayOf(PropTypes.string).isRequired,
};

module.exports = React.createClass({
    displayName: 'RightPanel',

    propTypes: {
        // TODO: We're trying to move away from these being props, but we need to know
        // whether we should be displaying a room or group member list
        roomId: React.PropTypes.string, // if showing panels for a given room, this is set
        groupId: React.PropTypes.string, // if showing panels for a given group, this is set
        collapsed: React.PropTypes.bool, // currently unused property to request for a minimized view of the panel
    },

    Phase: {
        RoomMemberList: 'RoomMemberList',
        GroupMemberList: 'GroupMemberList',
        GroupRoomList: 'GroupRoomList',
        FilePanel: 'FilePanel',
        NotificationPanel: 'NotificationPanel',
        RoomMemberInfo: 'RoomMemberInfo',
        GroupMemberInfo: 'GroupMemberInfo',
    },

    componentWillMount: function() {
        this.dispatcherRef = dis.register(this.onAction);
        const cli = MatrixClientPeg.get();
        cli.on("RoomState.members", this.onRoomStateMember);
    },

    componentWillUnmount: function() {
        dis.unregister(this.dispatcherRef);
        if (MatrixClientPeg.get()) {
            MatrixClientPeg.get().removeListener("RoomState.members", this.onRoomStateMember);
        }
    },

    getInitialState: function() {
        if (this.props.groupId) {
            return {
                phase: this.Phase.GroupMemberList,
            };
        } else {
            return {
                phase: this.Phase.RoomMemberList,
            };
        }
    },

    onCollapseClick: function() {
        dis.dispatch({
            action: 'hide_right_panel',
        });
    },

    onInviteButtonClick: function() {
        if (MatrixClientPeg.get().isGuest()) {
            dis.dispatch({action: 'view_set_mxid'});
            return;
        }

        if (this.state.phase === this.Phase.GroupMemberList) {
            showGroupInviteDialog(this.props.groupId);
        } else if (this.state.phase === this.Phase.GroupRoomList) {
            showGroupAddRoomDialog(this.props.groupId).then(() => {
                this.forceUpdate();
            });
        } else {
            // call AddressPickerDialog
            dis.dispatch({
                action: 'view_invite',
                roomId: this.props.roomId,
            });
        }
    },

    onRoomStateMember: function(ev, state, member) {
        // redraw the badge on the membership list
        if (this.state.phase == this.Phase.RoomMemberList && member.roomId === this.props.roomId) {
            this._delayedUpdate();
        }
        else if (this.state.phase === this.Phase.RoomMemberInfo && member.roomId === this.props.roomId &&
                member.userId === this.state.member.userId) {
            // refresh the member info (e.g. new power level)
            this._delayedUpdate();
        }
    },

    _delayedUpdate: new rate_limited_func(function() {
        this.forceUpdate();
    }, 500),

    onAction: function(payload) {
        if (payload.action === "view_user") {
            dis.dispatch({
                action: 'show_right_panel',
            });
            if (payload.member) {
                this.setState({
                    phase: this.Phase.RoomMemberInfo,
                    member: payload.member,
                });
            } else {
                if (this.props.roomId) {
                    this.setState({
                        phase: this.Phase.RoomMemberList,
                    });
                } else if (this.props.groupId) {
                    this.setState({
                        phase: this.Phase.GroupMemberList,
                        groupId: payload.groupId,
                        member: payload.member,
                    });
                }
            }
        } else if (payload.action === "view_group") {
            this.setState({
                phase: this.Phase.GroupMemberList,
                groupId: payload.groupId,
                member: null,
            });
        } else if (payload.action === "view_group_user") {
            this.setState({
                phase: this.Phase.GroupMemberInfo,
                groupId: payload.groupId,
                member: payload.member,
            });
        } else if (payload.action === "view_room") {
            this.setState({
                phase: this.Phase.RoomMemberList,
            });
        } else if (payload.action === "view_right_panel_phase") {
            this.setState({
                phase: payload.phase,
            });
        }
    },

    render: function() {
        const MemberList = sdk.getComponent('rooms.MemberList');
        const MemberInfo = sdk.getComponent('rooms.MemberInfo');
        const NotificationPanel = sdk.getComponent('structures.NotificationPanel');
        const FilePanel = sdk.getComponent('structures.FilePanel');

        const GroupMemberList = sdk.getComponent('groups.GroupMemberList');
        const GroupMemberInfo = sdk.getComponent('groups.GroupMemberInfo');
        const GroupRoomList = sdk.getComponent('groups.GroupRoomList');

        const TintableSvg = sdk.getComponent("elements.TintableSvg");

        let inviteGroup;

        let membersBadge;
        if ((this.state.phase == this.Phase.RoomMemberList || this.state.phase === this.Phase.RoomMemberInfo)
            && this.props.roomId
        ) {
            const cli = MatrixClientPeg.get();
            const room = cli.getRoom(this.props.roomId);
            let userIsInRoom;
            if (room) {
                membersBadge = room.getJoinedMembers().length;
                userIsInRoom = room.hasMembershipState(
                    MatrixClientPeg.get().credentials.userId, 'join',
                );
            }

            if (userIsInRoom) {
                inviteGroup =
                    <AccessibleButton className="mx_RightPanel_invite" onClick={ this.onInviteButtonClick } >
                        <div className="mx_RightPanel_icon" >
                            <TintableSvg src="img/icon-invite-people.svg" width="35" height="35" />
                        </div>
                        <div className="mx_RightPanel_message">{ _t('Invite to this room') }</div>
                    </AccessibleButton>;
            }
        }

        let headerButtons = [];
        if (this.props.roomId) {
            headerButtons = [
                <HeaderButton key="_membersButton" title={_t('Members')} iconSrc="img/icons-people.svg"
                    isHighlighted={[this.Phase.RoomMemberList, this.Phase.RoomMemberInfo].includes(this.state.phase)}
                    clickPhase={this.Phase.RoomMemberList}
                    badge={membersBadge}
                    analytics={['Right Panel', 'Member List Button', 'click']}
                />,
                <HeaderButton key="_filesButton" title={_t('Files')} iconSrc="img/icons-files.svg"
                    isHighlighted={this.state.phase === this.Phase.FilePanel}
                    clickPhase={this.Phase.FilePanel}
                    analytics={['Right Panel', 'File List Button', 'click']}
                />,
                <HeaderButton key="_notifsButton" title={_t('Notifications')} iconSrc="img/icons-notifications.svg"
                    isHighlighted={this.state.phase === this.Phase.NotificationPanel}
                    clickPhase={this.Phase.NotificationPanel}
                    analytics={['Right Panel', 'Notification List Button', 'click']}
                />,
            ];
        } else if (this.props.groupId) {
            headerButtons = [
                <HeaderButton key="_groupMembersButton" title={_t('Members')} iconSrc="img/icons-people.svg"
                    isHighlighted={this.state.phase === this.Phase.GroupMemberList}
                    clickPhase={this.Phase.GroupMemberList}
                    analytics={['Right Panel', 'Group Member List Button', 'click']}
                />,
                <HeaderButton key="_roomsButton" title={_t('Rooms')} iconSrc="img/icons-room.svg"
                    isHighlighted={this.state.phase === this.Phase.GroupRoomList}
                    clickPhase={this.Phase.GroupRoomList}
                    analytics={['Right Panel', 'Group Room List Button', 'click']}
                />,
            ];
        }

        if (this.props.roomId || this.props.groupId) {
            // Hiding the right panel hides it completely and relies on an 'expand' button
            // being put in the RoomHeader or GroupView header, so only show the minimise
            // button on these 2 screens or you won't be able to re-expand the panel.
            headerButtons.push(
                <div className="mx_RightPanel_headerButton mx_RightPanel_collapsebutton" key="_minimizeButton"
                    title={ _t("Hide panel") } onClick={ this.onCollapseClick }
                >
                    <TintableSvg src="img/minimise.svg" width="10" height="16"/>
                </div>,
            );
        }

        let panel = <div />;
        if (!this.props.collapsed) {
            if (this.props.roomId && this.state.phase == this.Phase.RoomMemberList) {
                panel = <MemberList roomId={this.props.roomId} key={this.props.roomId} />;
            } else if (this.props.groupId && this.state.phase == this.Phase.GroupMemberList) {
                panel = <GroupMemberList groupId={this.props.groupId} key={this.props.groupId} />;
            } else if (this.state.phase === this.Phase.GroupRoomList) {
                panel = <GroupRoomList groupId={this.props.groupId} key={this.props.groupId} />;
            } else if (this.state.phase == this.Phase.RoomMemberInfo) {
                panel = <MemberInfo member={this.state.member} key={this.props.roomId || this.state.member.userId} />;
            } else if (this.state.phase == this.Phase.GroupMemberInfo) {
                panel = <GroupMemberInfo
                    groupMember={this.state.member}
                    groupId={this.props.groupId}
                    key={this.state.member.user_id} />;
            } else if (this.state.phase == this.Phase.NotificationPanel) {
                panel = <NotificationPanel />;
            } else if (this.state.phase == this.Phase.FilePanel) {
                panel = <FilePanel roomId={this.props.roomId} />;
            }
        }

        if (!panel) {
            panel = <div className="mx_RightPanel_blank"></div>;
        }

        if (this.props.groupId) {
            inviteGroup = this.state.phase === this.Phase.GroupMemberList ? (
                <AccessibleButton className="mx_RightPanel_invite" onClick={ this.onInviteButtonClick } >
                    <div className="mx_RightPanel_icon" >
                        <TintableSvg src="img/icon-invite-people.svg" width="35" height="35" />
                    </div>
                    <div className="mx_RightPanel_message">{ _t('Invite to this group') }</div>
                </AccessibleButton>
            ) : (
                <AccessibleButton className="mx_RightPanel_invite" onClick={ this.onInviteButtonClick } >
                    <div className="mx_RightPanel_icon" >
                        <TintableSvg src="img/icons-room-add.svg" width="35" height="35" />
                    </div>
                    <div className="mx_RightPanel_message">{ _t('Add room to this group') }</div>
                </AccessibleButton>
            );
        }

        let classes = "mx_RightPanel mx_fadable";
        if (this.props.collapsed) {
            classes += " collapsed";
        }

        return (
            <aside className={classes} style={{ opacity: this.props.opacity }}>
                <div className="mx_RightPanel_header">
                    <div className="mx_RightPanel_headerButtonGroup">
                        {headerButtons}
                    </div>
                </div>
                { panel }
                <div className="mx_RightPanel_footer">
                    { inviteGroup }
                </div>
            </aside>
        );
    },
});
